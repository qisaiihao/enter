// 引入腾讯云SDK和云开发SDK
const tencentcloud = require("tencentcloud-sdk-nodejs");
const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 拿到内容安全（cms）的 client
const CmsClient = tencentcloud.cms.v20190321.Client;

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('=== 内容审核云函数开始执行 ===');
  console.log('接收到的参数:', JSON.stringify(event, null, 2));
  
  // 从 event 中获取要审查的文本和图片fileID
  const { text, fileIDs, title, content, publishMode, isOriginal, author, tags } = event;
  
  // 策略ID配置 - 使用默认策略ID（数字类型）
  // 注意：BizType 参数需要是数字类型，不是字符串
  const TEXT_BIZ_TYPE = 0; // 文本审核策略ID，使用默认策略
  const IMAGE_BIZ_TYPE = 0; // 图片审核策略ID，使用默认策略
  
  // 调试模式：设置为true可以跳过审核（仅用于测试）
  const DEBUG_SKIP_AUDIT = false;

  // 检查环境变量
  console.log('环境变量检查:');
  console.log('TENCENT_SECRET_ID:', process.env.TENCENT_SECRET_ID ? '已设置' : '未设置');
  console.log('TENCENT_SECRET_KEY:', process.env.TENCENT_SECRET_KEY ? '已设置' : '未设置');
  
  if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
    console.error('环境变量未正确设置');
    return { code: -4, msg: '环境变量未正确设置，请检查TENCENT_SECRET_ID和TENCENT_SECRET_KEY' };
  }

  // ------------------- 安全配置 -------------------
  // 从环境变量中安全地读取密钥
  const clientConfig = {
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region: "ap-guangzhou", // 推荐使用广州地域，速度较快
    profile: {
      httpProfile: {
        endpoint: "cms.tencentcloudapi.com",
      },
    },
  };
  
  console.log('创建腾讯云客户端...');
  const client = new CmsClient(clientConfig);

  // ------------------- 1. 文本审核 -------------------
  if (DEBUG_SKIP_AUDIT) {
    console.log('调试模式：跳过文本审核');
  } else if (text || title || content) {
    try {
      // 合并所有文本内容进行审核
      const fullText = [title, content, text].filter(t => t && t.trim()).join(' ');
      console.log('准备审核的文本内容:', fullText);
      
      const textParams = {
        Content: Buffer.from(fullText).toString('base64')
        // 移除BizType参数，使用默认策略
      };
      
      console.log('调用文本审核API...');
      console.log('审核参数:', { 
        Content: textParams.Content.substring(0, 50) + '...'
      });
      
      const { Data } = await client.TextModeration(textParams);
      console.log('文本审核结果:', Data);
      
      if (Data.Suggestion !== 'Pass') {
        // 文本审核不通过，记录详细信息
        console.log('文本审核不通过，详细信息:', {
          suggestion: Data.Suggestion,
          labels: Data.Labels || [],
          subLabel: Data.SubLabel || '',
          confidence: Data.Confidence || 0
        });
        
        return {
          code: -1,
          msg: '文本内容不合规',
          suggestion: Data.Suggestion,
          details: Data.Labels || []
        };
      }
      console.log('文本审核通过');
    } catch (error) {
      console.error("文本审核API调用失败:", error);
      console.error("错误详情:", {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      return { code: -2, msg: '文本审核服务异常: ' + error.message };
    }
  }

  // ------------------- 2. 图片审核 -------------------
  if (DEBUG_SKIP_AUDIT) {
    console.log('调试模式：跳过图片审核');
  } else if (fileIDs && fileIDs.length > 0) {
    try {
      // 1. 用 fileID 换取临时的图片下载链接
      const fileList = fileIDs;
      const result = await cloud.getTempFileURL({ fileList });
      
      // 2. 对每张图片进行审核
      for (let i = 0; i < result.fileList.length; i++) {
        const fileItem = result.fileList[i];
        if (fileItem.status === 0) { // 成功获取临时URL
          const imageParams = {
            FileUrl: fileItem.tempFileURL
            // 移除BizType参数，使用默认策略
          };
          const { Data } = await client.ImageModeration(imageParams);
          console.log('图片审核结果:', Data);
          
          // 图片审核的判断逻辑：检查各个检测模块的HitFlag
          const hasViolation = Data.PornDetect?.HitFlag > 0 || 
                              Data.HotDetect?.HitFlag > 0 || 
                              Data.PolityDetect?.HitFlag > 0 || 
                              Data.IllegalDetect?.HitFlag > 0 || 
                              Data.TerrorDetect?.HitFlag > 0;
          
          if (hasViolation) {
            // 图片审核不通过，记录详细信息
            console.log('图片审核不通过，详细信息:', {
              pornDetect: Data.PornDetect,
              hotDetect: Data.HotDetect,
              polityDetect: Data.PolityDetect,
              illegalDetect: Data.IllegalDetect,
              terrorDetect: Data.TerrorDetect
            });
            
            return {
              code: -1,
              msg: '图片内容不合规',
              details: {
                pornDetect: Data.PornDetect,
                hotDetect: Data.HotDetect,
                polityDetect: Data.PolityDetect,
                illegalDetect: Data.IllegalDetect,
                terrorDetect: Data.TerrorDetect
              }
            };
          }
        }
      }
    } catch (error) {
      console.error("图片审核API调用失败:", error);
      return { code: -2, msg: '图片审核服务异常' };
    }
  }
  
  // ------------------- 3. 审核全部通过，写入数据库 -------------------
  try {
    // 获取当前用户信息
    const userInfo = await db.collection('users').where({
      _openid: cloud.getWXContext().OPENID
    }).get();
    const userNickName = userInfo.data.length > 0 ? userInfo.data[0].nickName : '匿名用户';
    
    // 确定作者信息
    let authorName = '';
    if (publishMode === 'poem') {
      if (isOriginal) {
        // 原创诗歌：如果填写了作者就用填写的，否则使用用户昵称
        authorName = author && author.trim() ? author.trim() : userNickName;
      } else {
        // 非原创诗歌：必须使用填写的作者
        authorName = author && author.trim() ? author.trim() : '';
      }
    } else {
      // 普通帖子：使用用户昵称
      authorName = userNickName;
    }

    const postData = {
      _openid: cloud.getWXContext().OPENID, // 添加openid字段
      title: title || '',
      content: content || '',
      createTime: new Date(),
      votes: 0,
      commentCount: 0,
      // 新增诗歌相关字段
      isPoem: publishMode === 'poem',
      isOriginal: isOriginal || false,
      // 新增作者字段
      author: authorName,
      // 新增标签字段
      tags: tags || [],
      // 审核状态
      auditStatus: 'approved', // 审核通过
      auditTime: new Date()
    };
    
    if (fileIDs && fileIDs.length > 0) {
      postData.imageUrl = fileIDs[0];
      postData.imageUrls = fileIDs;
      
      // 如果是诗歌模式，第一张图片作为背景图
      if (publishMode === 'poem' && fileIDs.length > 0) {
        postData.poemBgImage = fileIDs[0];
      }
    }

    const result = await db.collection('posts').add({
      data: postData
    });

    // 全部成功，返回成功状态
    return {
      code: 0,
      msg: '发布成功',
      postId: result._id
    };

  } catch (dbError) {
    console.error("数据库写入失败:", dbError);
    return { code: -3, msg: '数据存储失败' };
  }
};
