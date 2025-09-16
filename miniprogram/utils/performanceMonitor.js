// 性能监控工具
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      pageLoadTimes: {},
      apiCallTimes: {},
      imageLoadTimes: {},
      cacheHitRates: {}
    };
  }

  // 记录页面加载时间
  recordPageLoad(pageName, startTime) {
    const loadTime = Date.now() - startTime;
    this.metrics.pageLoadTimes[pageName] = loadTime;
    console.log(`页面 ${pageName} 加载时间: ${loadTime}ms`);
  }

  // 记录API调用时间
  recordApiCall(apiName, startTime) {
    const callTime = Date.now() - startTime;
    this.metrics.apiCallTimes[apiName] = callTime;
    console.log(`API ${apiName} 调用时间: ${callTime}ms`);
  }

  // 记录图片加载时间
  recordImageLoad(imageUrl, startTime) {
    const loadTime = Date.now() - startTime;
    this.metrics.imageLoadTimes[imageUrl] = loadTime;
    console.log(`图片加载时间: ${loadTime}ms`);
  }

  // 记录缓存命中率
  recordCacheHit(cacheKey, hit) {
    if (!this.metrics.cacheHitRates[cacheKey]) {
      this.metrics.cacheHitRates[cacheKey] = { hits: 0, misses: 0 };
    }
    
    if (hit) {
      this.metrics.cacheHitRates[cacheKey].hits++;
    } else {
      this.metrics.cacheHitRates[cacheKey].misses++;
    }
  }

  // 获取性能报告
  getReport() {
    const report = {
      averagePageLoadTime: this.getAverageTime(this.metrics.pageLoadTimes),
      averageApiCallTime: this.getAverageTime(this.metrics.apiCallTimes),
      averageImageLoadTime: this.getAverageTime(this.metrics.imageLoadTimes),
      cacheHitRates: this.calculateCacheHitRates()
    };
    
    console.log('性能报告:', report);
    return report;
  }

  getAverageTime(times) {
    const values = Object.values(times);
    if (values.length === 0) return 0;
    return values.reduce((sum, time) => sum + time, 0) / values.length;
  }

  calculateCacheHitRates() {
    const rates = {};
    Object.keys(this.metrics.cacheHitRates).forEach(key => {
      const data = this.metrics.cacheHitRates[key];
      const total = data.hits + data.misses;
      rates[key] = total > 0 ? (data.hits / total * 100).toFixed(2) + '%' : '0%';
    });
    return rates;
  }

  // 重置指标
  reset() {
    this.metrics = {
      pageLoadTimes: {},
      apiCallTimes: {},
      imageLoadTimes: {},
      cacheHitRates: {}
    };
  }
}

// 创建单例
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;
