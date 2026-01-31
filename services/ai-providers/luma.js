const axios = require('axios');

class LumaProvider {
  constructor() {
    this.apiKey = process.env.LUMA_API_KEY;
    this.baseURL = 'https://api.lumalabs.ai/dream-machine/v1';
  }

  async generateVideo(params) {
    const { prompt, imageUrl, aspectRatio = '16:9', loop = false } = params;
    
    // Luma Ray2/Ray3: 5-9 seconds, excellent motion coherence
    // Pricing: ~$0.32 per video (scales with plan)
    
    const payload = {
      prompt,
      aspect_ratio: aspectRatio, // 16:9, 9:16, 1:1, 4:3, 3:4, 21:9
      loop,
      // Optional: keyframes for start/end control
      ...(imageUrl && { 
        image_url: imageUrl,
        image_end_url: params.imageEndUrl // For keyframe control
      })
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/generations`,
        payload,
        { 
          headers: { 
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        provider: 'luma',
        taskId: response.data.id,
        status: 'pending',
        createdAt: response.data.created_at
      };
    } catch (error) {
      console.error('Luma API Error:', error.response?.data || error.message);
      throw new Error(`Luma generation failed: ${error.message}`);
    }
  }

  async checkStatus(taskId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/generations/${taskId}`,
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
      );

      const { state, assets, failure_reason } = response.data;
      
      return {
        status: this.mapStatus(state), // pending, processing, completed, failed
        url: assets?.video?.url,
        thumbnail: assets?.image?.url,
        error: failure_reason,
        metadata: response.data
      };
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  mapStatus(state) {
    const mapping = {
      'queued': 'pending',
      'processing': 'processing',
      'completed': 'completed',
      'failed': 'failed'
    };
    return mapping[state] || state;
  }
}

module.exports = LumaProvider;
