// avatarCompress.js - 专门用于头像压缩的工具函数
/**
 * 头像压缩函数 - 实现激进的压缩策略
 * @param {string} filePath 原始图片路径
 * @returns {Promise<string>} 返回压缩后的图片路径
 */
function compressAvatar(filePath) {
  return new Promise((resolve, reject) => {
    // 获取系统信息
    wx.getSystemInfo({
      success: (res) => {
        const { pixelRatio, system } = res;
        const isIOS = /(ios)/ig.test(system);
        
        // 头像压缩参数 - 非常激进的设置
        const avatarConfig = {
          // 头像尺寸限制 - 非常小
          maxWidth: 200,
          maxHeight: 200,
          // 压缩质量 - 非常低
          quality: isIOS ? 0.3 : 0.2, // iOS: 30%, Android: 20%
          // 文件大小限制 - 50KB
          maxSize: 50 * 1024
        };
        
        console.log('开始压缩头像，原始路径:', filePath);
        console.log('压缩配置:', avatarConfig);
        
        // 先获取图片信息
        wx.getImageInfo({
          src: filePath,
          success: (imageInfo) => {
            console.log('原始图片信息:', {
              width: imageInfo.width,
              height: imageInfo.height,
              path: imageInfo.path
            });
            
            // 计算压缩后的尺寸
            let { width, height } = imageInfo;
            const { maxWidth, maxHeight } = avatarConfig;
            
            // 按比例缩放，保持宽高比
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.floor(width * ratio);
              height = Math.floor(height * ratio);
            }
            
            console.log('压缩后尺寸:', { width, height });
            
            // 使用canvas进行压缩
            const canvas = wx.createCanvasContext('avatarCompressCanvas');
            
            // 绘制压缩后的图片
            canvas.drawImage(filePath, 0, 0, width, height);
            canvas.draw(false, () => {
              // 导出为临时文件
              wx.canvasToTempFilePath({
                canvasId: 'avatarCompressCanvas',
                x: 0,
                y: 0,
                width: width,
                height: height,
                destWidth: width,
                destHeight: height,
                fileType: 'jpg', // 强制使用jpg格式，压缩率更高
                quality: avatarConfig.quality,
                success: (canvasRes) => {
                  console.log('Canvas压缩完成，临时文件:', canvasRes.tempFilePath);
                  
                  // 检查压缩后的文件大小
                  wx.getFileInfo({
                    filePath: canvasRes.tempFilePath,
                    success: (fileInfo) => {
                      console.log('压缩后文件大小:', (fileInfo.size / 1024).toFixed(2), 'KB');
                      
                      // 如果文件还是太大，使用wx.compressImage进一步压缩
                      if (fileInfo.size > avatarConfig.maxSize) {
                        console.log('文件仍然过大，使用wx.compressImage进一步压缩');
                        wx.compressImage({
                          src: canvasRes.tempFilePath,
                          quality: 0.1, // 极低质量
                          success: (compressRes) => {
                            console.log('最终压缩完成:', compressRes.tempFilePath);
                            resolve(compressRes.tempFilePath);
                          },
                          fail: (err) => {
                            console.error('wx.compressImage压缩失败:', err);
                            // 即使压缩失败，也返回canvas压缩的结果
                            resolve(canvasRes.tempFilePath);
                          }
                        });
                      } else {
                        resolve(canvasRes.tempFilePath);
                      }
                    },
                    fail: (err) => {
                      console.error('获取压缩后文件信息失败:', err);
                      resolve(canvasRes.tempFilePath);
                    }
                  });
                },
                fail: (err) => {
                  console.error('Canvas压缩失败:', err);
                  // Canvas压缩失败，使用wx.compressImage作为备选
                  wx.compressImage({
                    src: filePath,
                    quality: avatarConfig.quality,
                    success: (compressRes) => {
                      console.log('备选压缩完成:', compressRes.tempFilePath);
                      resolve(compressRes.tempFilePath);
                    },
                    fail: (err) => {
                      console.error('备选压缩也失败:', err);
                      reject(err);
                    }
                  });
                }
              });
            });
          },
          fail: (err) => {
            console.error('获取图片信息失败:', err);
            // 获取图片信息失败，直接使用wx.compressImage
            wx.compressImage({
              src: filePath,
              quality: avatarConfig.quality,
              success: (compressRes) => {
                console.log('直接压缩完成:', compressRes.tempFilePath);
                resolve(compressRes.tempFilePath);
              },
              fail: (err) => {
                console.error('直接压缩失败:', err);
                reject(err);
              }
            });
          }
        });
      },
      fail: (err) => {
        console.error('获取系统信息失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 创建隐藏的canvas用于头像压缩
 * 这个函数需要在页面中调用，创建隐藏的canvas元素
 */
function createAvatarCompressCanvas() {
  // 这个函数需要在页面的wxml中添加隐藏的canvas
  // <canvas canvas-id="avatarCompressCanvas" style="position: fixed; top: -9999px; left: -9999px; width: 200px; height: 200px;"></canvas>
}

module.exports = {
  compressAvatar,
  createAvatarCompressCanvas
};
