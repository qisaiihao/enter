// 反馈管理云函数
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const action = event.action
    console.log('feedbackManager 云函数收到操作:', action)
    console.log('完整事件数据:', event)
    
    switch (action) {
      case 'submitFeedback':
        return await submitFeedback(event)
      case 'getFeedbackList':
        return await getFeedbackList(event)
      case 'deleteFeedback':
        return await deleteFeedback(event)
      case 'markAsProcessed':
        return await markAsProcessed(event)
      default:
        console.error('未知的操作类型:', action)
        return {
          success: false,
          error: `未知的操作类型: ${action}`
        }
    }
  } catch (error) {
    console.error('feedbackManager 云函数错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 提交反馈
async function submitFeedback(data) {
  const { content, imageUrls = [] } = data
  
  try {
    // 获取用户信息
    const { OPENID } = cloud.getWXContext()
    
    // 获取用户资料
    const userResult = await db.collection('users').where({
      _openid: OPENID
    }).get()
    
    const userName = userResult.data.length > 0 ? userResult.data[0].nickName : '匿名用户'
    
    // 创建反馈记录
    const feedbackData = {
      content: content,
      imageUrls: imageUrls,
      userName: userName,
      userOpenid: OPENID,
      isProcessed: false,
      createTime: new Date(),
      processedTime: null
    }
    
    const result = await db.collection('feedback').add({
      data: feedbackData
    })
    
    console.log('反馈提交成功:', result)
    
    // === 新增：通知管理员有新反馈 ===
    try {
      const adminOpenids = ['ojYBd1_A3uCbQ1LGcHxWxOAeA5SE', 'ojYBd14JG3-ghYuGCI2WHmkMc9nE'] // 管理员openid列表
      
      // 为每个管理员发送通知
      for (const adminOpenid of adminOpenids) {
        await db.collection('messages').add({
          data: {
            fromUserId: OPENID,
            fromUserName: userName,
            fromUserAvatar: userResult.data.length > 0 ? userResult.data[0].avatarUrl : '',
            toUserId: adminOpenid,
            type: 'feedback',
            feedbackId: result._id,
            content: `${userName} 提交了新的意见反馈`,
            isRead: false,
            createTime: new Date()
          }
        })
      }
      console.log('反馈通知已发送给管理员')
    } catch (msgError) {
      console.error('发送反馈通知失败:', msgError)
      // 不影响主流程，只是记录错误
    }
    
    return {
      success: true,
      feedbackId: result._id,
      message: '反馈提交成功'
    }
  } catch (error) {
    console.error('提交反馈失败:', error)
    throw new Error(`提交反馈失败: ${error.message}`)
  }
}

// 获取反馈列表（管理员）
async function getFeedbackList(data) {
  const { skip = 0, limit = 10 } = data
  
  try {
    // 检查管理员权限
    const { OPENID } = cloud.getWXContext()
    const adminOpenids = ['ojYBd1_A3uCbQ1LGcHxWxOAeA5SE', 'ojYBd14JG3-ghYuGCI2WHmkMc9nE'] // 管理员openid列表
    const isAdmin = adminOpenids.includes(OPENID)
    
    if (!isAdmin) {
      return {
        success: false,
        error: '权限不足，只有管理员可以查看反馈列表'
      }
    }
    
    const result = await db.collection('feedback')
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
    
    console.log('获取反馈列表成功:', result.data.length)
    
    return {
      success: true,
      feedbackList: result.data,
      total: result.data.length
    }
  } catch (error) {
    console.error('获取反馈列表失败:', error)
    throw new Error(`获取反馈列表失败: ${error.message}`)
  }
}

// 删除反馈（管理员）
async function deleteFeedback(data) {
  const { feedbackId } = data
  
  try {
    // 检查管理员权限
    const { OPENID } = cloud.getWXContext()
    const adminOpenids = ['ojYBd1_A3uCbQ1LGcHxWxOAeA5SE', 'ojYBd14JG3-ghYuGCI2WHmkMc9nE'] // 管理员openid列表
    const isAdmin = adminOpenids.includes(OPENID)
    
    if (!isAdmin) {
      return {
        success: false,
        error: '权限不足，只有管理员可以删除反馈'
      }
    }
    
    // 先获取反馈信息，用于删除相关图片
    const feedbackResult = await db.collection('feedback').doc(feedbackId).get()
    if (feedbackResult.data.length === 0) {
      return {
        success: false,
        error: '反馈不存在'
      }
    }
    
    const feedback = feedbackResult.data[0]
    
    // 删除云存储中的图片
    if (feedback.imageUrls && feedback.imageUrls.length > 0) {
      try {
        await cloud.deleteFile({
          fileList: feedback.imageUrls
        })
        console.log('删除反馈图片成功')
      } catch (imageError) {
        console.error('删除反馈图片失败:', imageError)
        // 图片删除失败不影响反馈删除
      }
    }
    
    // 删除反馈记录
    const result = await db.collection('feedback').doc(feedbackId).remove()
    
    console.log('删除反馈成功:', result)
    
    return {
      success: true,
      message: '反馈删除成功'
    }
  } catch (error) {
    console.error('删除反馈失败:', error)
    throw new Error(`删除反馈失败: ${error.message}`)
  }
}

// 标记反馈为已处理（管理员）
async function markAsProcessed(data) {
  const { feedbackId } = data
  
  try {
    // 检查管理员权限
    const { OPENID } = cloud.getWXContext()
    const adminOpenids = ['ojYBd1_A3uCbQ1LGcHxWxOAeA5SE', 'ojYBd14JG3-ghYuGCI2WHmkMc9nE'] // 管理员openid列表
    const isAdmin = adminOpenids.includes(OPENID)
    
    if (!isAdmin) {
      return {
        success: false,
        error: '权限不足，只有管理员可以处理反馈'
      }
    }
    
    // 先获取反馈信息，用于通知用户
    const feedbackResult = await db.collection('feedback').doc(feedbackId).get()
    if (feedbackResult.data.length === 0) {
      return {
        success: false,
        error: '反馈不存在'
      }
    }
    
    const feedback = feedbackResult.data[0]
    
    const result = await db.collection('feedback').doc(feedbackId).update({
      data: {
        isProcessed: true,
        processedTime: new Date()
      }
    })
    
    console.log('标记反馈为已处理成功:', result)
    
    // === 新增：通知用户反馈已处理 ===
    try {
      await db.collection('messages').add({
        data: {
          fromUserId: OPENID,
          fromUserName: '管理员',
          fromUserAvatar: '',
          toUserId: feedback.userOpenid,
          type: 'feedback_processed',
          feedbackId: feedbackId,
          content: '您的意见反馈已被处理',
          isRead: false,
          createTime: new Date()
        }
      })
      console.log('反馈处理通知已发送给用户')
    } catch (msgError) {
      console.error('发送反馈处理通知失败:', msgError)
      // 不影响主流程，只是记录错误
    }
    
    return {
      success: true,
      message: '反馈已标记为处理'
    }
  } catch (error) {
    console.error('标记反馈处理失败:', error)
    throw new Error(`标记反馈处理失败: ${error.message}`)
  }
}
