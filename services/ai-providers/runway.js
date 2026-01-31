const axios = require('axios');

class RunwayProvider {
  constructor() {
    this.apiKey = process.env.RUNWAY_API_KEY;
    this.baseURL = 'https://api.dev.runwayml.com/v1';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async generateVideo(params) {
    const { prompt, imageUrl, duration = 5, ratio = '16:9' } = params;
    
    // Cost: Gen-3 Alpha = 10 credits/sec, Gen-3 Turbo = 5 credits/sec
    // $0.01 per credit = $0.50 for 10s Gen-3 or $0.25 for Turbo
    
    const endpoint = imageUrl ? '/image_to_video' : '/text_to_video';
    
    const payload = {
      prompt,
      ratio,
      duration, // 5 or 10 seconds for Gen-3
      // Use Gen-3 Alpha Turbo if image provided (cheaper, faster)
      model: imageUrl ? 'gen3a_turbo' : 'gen3a_alpha',
      ...(imageUrl && { image_url: imageUrl })
    };

    try {
      const response = await axios.post(
        `${this.baseURL}${endpoint}`, 
        payload, 
        { headers: this.headers }
      );
      
      return {
        provider: 'runway',
        taskId: response.data.id,
        status: 'pending',
        estimatedCost: this.calculateCost(duration, payload.model)
      };
    } catch (error) {
      console.error('Runway API Error:', error.response?.data || error.message);
      throw new Error(`Runway generation failed: ${error.message}`);
    }
  }

  async checkStatus(taskId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/tasks/${taskId}`,
        { headers: this.headers }
      );
      
      return {
        status: response.data.status, // pending, processing, completed, failed
        progress: response.data.progress,
        url: response.data.url, // Available when completed
        metadata: response.data
      };
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  calculateCost(duration, model) {
    const rates = {
      'gen3a_alpha': 10, // credits per second
      'gen3a_turbo': 5,
      'gen4_turbo': 5,
      'gen4_aleph': 15
    };
    const credits = (rates[model] || 10) * duration;
    return {
      credits,
      usd: credits * 0.01 // $0.01 per credit
    };
  }
}

module.exports = RunwayProvider;
