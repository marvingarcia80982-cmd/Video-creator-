const RunwayProvider = require('./ai-providers/runway');
const LumaProvider = require('./ai-providers/luma');
const ReplicateProvider = require('./ai-providers/replicate');

class VideoGenerator {
  constructor() {
    this.providers = {
      runway: new RunwayProvider(),
      luma: new LumaProvider(),
      replicate: new ReplicateProvider()
    };
  }

  async generate(params) {
    const { provider = 'luma', ...generationParams } = params;
    
    if (!this.providers[provider]) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Add metadata tracking
    const startTime = Date.now();
    const result = await this.providers[provider].generateVideo(generationParams);
    
    return {
      ...result,
      requestedAt: new Date(startTime),
      params: generationParams
    };
  }

  async checkStatus(provider, taskId) {
    return this.providers[provider].checkStatus(taskId);
  }

  // Strategy: Try multiple providers for redundancy
  async generateWithFallback(params) {
    const providers = ['luma', 'runway', 'replicate'];
    
    for (const provider of providers) {
      try {
        console.log(`Trying provider: ${provider}`);
        return await this.generate({ ...params, provider });
      } catch (error) {
        console.warn(`${provider} failed:`, error.message);
        continue;
      }
    }
    
    throw new Error('All providers failed');
  }
}

module.exports = new VideoGenerator();
