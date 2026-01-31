const Replicate = require('replicate');

class ReplicateProvider {
  constructor() {
    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
    
    // Stable Video Diffusion - Image to Video only
    // Cost: ~$0.18 per generation
    this.modelVersion = "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438";
  }

  async generateVideo(params) {
    const { 
      imageUrl, 
      motionBucketId = 127, // 1-255, higher = more motion
      fps = 6,
      condAug = 0.02 // Conditioning augmentation
    } = params;

    if (!imageUrl) {
      throw new Error('Stable Video Diffusion requires an input image. Use Runway or Luma for text-to-video.');
    }

    try {
      // Create prediction
      const prediction = await this.replicate.predictions.create({
        version: this.modelVersion,
        input: {
          image: imageUrl,
          motion_bucket_id: motionBucketId,
          fps,
          cond_aug: condAug,
          decoding_t: 7, // Number of frames to decode
          video_length: "14_frames_with_svd" // or "25_frames_with_svd_xt"
        }
      });

      return {
        provider: 'replicate',
        taskId: prediction.id,
        status: 'pending',
        model: 'stable-video-diffusion'
      };
    } catch (error) {
      console.error('Replicate API Error:', error);
      throw new Error(`SVD generation failed: ${error.message}`);
    }
  }

  async checkStatus(taskId) {
    try {
      const prediction = await this.replicate.predictions.get(taskId);
      
      return {
        status: prediction.status, // starting, processing, succeeded, failed
        url: prediction.output,
        error: prediction.error,
        logs: prediction.logs,
        metrics: prediction.metrics
      };
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  // Helper to poll until complete (Replicate doesn't have webhooks on free tier)
  async pollUntilComplete(taskId, onProgress) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const status = await this.checkStatus(taskId);
          
          if (onProgress) onProgress(status);
          
          if (status.status === 'succeeded') {
            clearInterval(interval);
            resolve(status);
          } else if (status.status === 'failed') {
            clearInterval(interval);
            reject(new Error(status.error));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, 2000); // Poll every 2 seconds
    });
  }
}

module.exports = ReplicateProvider;
