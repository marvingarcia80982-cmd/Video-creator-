const express = require('express');
const { authenticate } = require('../middleware/auth');
const videoGenerator = require('../services/video-generator');
const storage = require('../services/storage');
const { query } = require('../database/pool');

const router = express.Router();

// Generate 3 scene variations
router.post('/generate', authenticate, async (req, res) => {
  const { prompt, imageUrl, style, duration = 5, aspectRatio = '16:9' } = req.body;
  const userId = req.user.id;
  
  try {
    // Check user credits (e.g., 10 credits per generation)
    const creditCheck = await query('SELECT credits_balance FROM users WHERE id = $1', [userId]);
    const credits = creditCheck.rows[0].credits_balance;
    
    const costPerScene = 10;
    const totalCost = costPerScene * 3;
    
    if (credits < totalCost) {
      return res.status(403).json({ error: 'Insufficient credits', required: totalCost, available: credits });
    }
    
    // Deduct credits
    await query('UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2', [totalCost, userId]);
    
    // Create parent scene record
    const parentResult = await query(
      `INSERT INTO scenes (user_id, prompt, status, credits_used) 
       VALUES ($1, $2, 'pending', $3) RETURNING id`,
      [userId, prompt, totalCost]
    );
    const parentSceneId = parentResult.rows[0].id;
    
    // Generate 3 variations with different parameters
    const variations = await Promise.all([
      // Variation 1: Default/Cinematic
      videoGenerator.generate({
        prompt: `${prompt}. Cinematic lighting, professional color grading, 24fps film look.`,
        imageUrl,
        duration,
        aspectRatio,
        provider: 'luma'
      }),
      // Variation 2: Stylized (use Runway for different look)
      videoGenerator.generate({
        prompt: `${prompt}. ${style || 'High contrast, dramatic shadows, stylized aesthetic.'}`,
        imageUrl,
        duration,
        aspectRatio,
        provider: 'runway'
      }),
      // Variation 3: Alternative angle (use Luma with different settings)
      videoGenerator.generate({
        prompt: `${prompt}. Wide angle shot, atmospheric depth, slight camera movement.`,
        imageUrl,
        duration,
        aspectRatio,
        provider: 'luma'
      })
    ]);
    
    // Save variation records to DB
    const sceneIds = [];
    for (let i = 0; i < variations.length; i++) {
      const varResult = await query(
        `INSERT INTO scenes 
         (user_id, parent_scene_id, prompt, provider, provider_task_id, status, variation_index, credits_used) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [userId, parentSceneId, prompt, variations[i].provider, variations[i].taskId, 'pending', i, costPerScene]
      );
      sceneIds.push(varResult.rows[0].id);
    }
    
    // Return immediately with task IDs (async processing)
    res.json({
      message: 'Generation started',
      parentSceneId,
      scenes: variations.map((v, i) => ({
        sceneId: sceneIds[i],
        variation: i,
        provider: v.provider,
        taskId: v.taskId,
        status: 'pending'
      }))
    });
    
  } catch (error) {
    console.error('Generation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check status of all variations
router.get('/status/:parentSceneId', authenticate, async (req, res) => {
  try {
    const { parentSceneId } = req.params;
    
    const result = await query(
      'SELECT * FROM scenes WHERE parent_scene_id = $1 OR id = $1 ORDER BY variation_index',
      [parentSceneId]
    );
    
    // Check fresh status from providers for pending items
    const updatedScenes = await Promise.all(result.rows.map(async (scene) => {
      if (scene.status === 'pending' || scene.status === 'processing') {
        try {
          const providerStatus = await videoGenerator.checkStatus(scene.provider, scene.provider_task_id);
          
          // Update DB if status changed
          if (providerStatus.status !== scene.status) {
            await query(
              'UPDATE scenes SET status = $1, progress = $2, video_url = $3 WHERE id = $4',
              [providerStatus.status, providerStatus.progress || 0, providerStatus.url, scene.id]
            );
            
            // If completed, transfer to S3 for permanent storage
            if (providerStatus.status === 'completed' && providerStatus.url && !scene.video_url) {
              const s3Data = await storage.uploadVideoFromUrl(
                providerStatus.url, 
                req.user.id, 
                scene.id
              );
              
              await query(
                'UPDATE scenes SET video_url = $1, metadata = $2 WHERE id = $3',
                [s3Data.url, JSON.stringify({ ...providerStatus, s3Key: s3Data.key }), scene.id]
              );
              
              scene.video_url = s3Data.url;
            }
          }
          
          return { ...scene, ...providerStatus };
        } catch (error) {
          console.error(`Status check failed for scene ${scene.id}:`, error);
          return scene;
        }
      }
      return scene;
    }));
    
    res.json({ scenes: updatedScenes });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get signed download URL
router.get('/download/:sceneId', authenticate, async (req, res) => {
  try {
    const { sceneId } = req.params;
    
    const result = await query(
      'SELECT video_url, metadata FROM scenes WHERE id = $1 AND user_id = $2',
      [sceneId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scene not found' });
    }
    
    const scene = result.rows[0];
    if (!scene.video_url) {
      return res.status(400).json({ error: 'Video not ready' });
    }
    
    // Generate signed URL for S3 download
    const s3Key = scene.metadata?.s3Key;
    if (s3Key) {
      const signedUrl = await storage.getSignedDownloadUrl(s3Key, 3600); // 1 hour expiry
      return res.json({ downloadUrl: signedUrl, expiresIn: 3600 });
    }
    
    // Fallback to direct URL if not in S3 yet
    res.json({ downloadUrl: scene.video_url });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
