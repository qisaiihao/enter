// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const action = event.action
    console.log('imageManager 云函数收到操作:', action)
    console.log('完整事件数据:', event)
    
    switch (action) {
      case 'uploadImage':
        return await uploadImage(event)
      case 'getImageUrl':
        return await getImageUrl(event)
      case 'deleteImage':
        return await deleteImage(event)
      case 'getImageList':
        return await getImageList(event)
      default:
        console.error('未知的操作类型:', action)
        return {
          success: false,
          error: `未知的操作类型: ${action}`
        }
    }
  } catch (error) {
    console.error('imageManager 云函数错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 上传到云存储并记录到数据库
async function uploadImage(data) {
  const { fileContent, cloudPath, category = 'general', metadata = {} } = data
  
  try {
    console.log('开始上传图片:', { cloudPath, category, metadata })
    
    // 检查数据库集合是否存在
    try {
      await db.collection('images').limit(1).get()
      console.log('数据库集合检查通过')
    } catch (dbError) {
      console.error('数据库集合检查失败:', dbError)
      if (dbError.code === -502001) {
        throw new Error('数据库集合 images 不存在，请先创建')
      }
      throw dbError
    }
    
    // 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: `images/${category}/${cloudPath}`,
      fileContent: Buffer.from(fileContent, 'base64')
    })

    console.log('云存储上传成功:', uploadResult.fileID)

    // 记录到数据库
    const dbResult = await db.collection('images').add({
      data: {
        fileID: uploadResult.fileID,
        cloudPath: uploadResult.fileID,
        category: category,
        metadata: metadata,
        uploadTime: new Date(),
        size: fileContent.length,
        status: 'active'
      }
    })

    console.log('数据库记录成功:', dbResult._id)

    return {
      success: true,
      fileID: uploadResult.fileID,
      imageId: dbResult._id,
      url: uploadResult.fileID
    }
  } catch (error) {
    console.error('图片上传失败:', error)
    throw new Error(`图片上传失败: ${error.message}`)
  }
}

// 获取图片访问URL
async function getImageUrl(data) {
  const { imageId, fileID, category, name } = data
  
  try {
    let targetFileID = fileID
    
    // 如果提供了imageId，从数据库查询
    if (imageId) {
      const dbResult = await db.collection('images').doc(imageId).get()
      if (dbResult.data) {
        targetFileID = dbResult.data.fileID
      }
    }
    
    // 如果提供了分类和名称，从数据库查询
    if (category && name && !targetFileID) {
      const dbResult = await db.collection('images')
        .where({
          category: category,
          'metadata.name': name,
          status: 'active'
        })
        .orderBy('uploadTime', 'desc')
        .limit(1)
        .get()
      
      if (dbResult.data.length > 0) {
        targetFileID = dbResult.data[0].fileID
      }
    }
    
    if (!targetFileID) {
      throw new Error('找不到图片')
    }

    // 获取临时访问URL
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [targetFileID]
    })

    if (tempUrlResult.fileList.length > 0 && tempUrlResult.fileList[0].tempFileURL) {
      return {
        success: true,
        url: tempUrlResult.fileList[0].tempFileURL,
        fileID: targetFileID,
        expireTime: tempUrlResult.fileList[0].maxAge || 7200
      }
    } else {
      throw new Error('获取图片URL失败')
    }
  } catch (error) {
    throw new Error(`获取图片URL失败: ${error.message}`)
  }
}

// 删除图片
async function deleteImage(data) {
  const { imageId, fileID } = data
  
  try {
    let targetFileID = fileID
    let targetDocId = imageId

    // 如果提供了imageId，先查询获取fileID
    if (imageId) {
      const dbResult = await db.collection('images').doc(imageId).get()
      if (dbResult.data) {
        targetFileID = dbResult.data.fileID
      }
    }

    // 删除云存储文件
    if (targetFileID) {
      await cloud.deleteFile({
        fileList: [targetFileID]
      })
    }

    // 更新数据库记录状态
    if (targetDocId) {
      await db.collection('images').doc(targetDocId).update({
        data: {
          status: 'deleted',
          deleteTime: new Date()
        }
      })
    }

    return {
      success: true,
      message: '图片删除成功'
    }
  } catch (error) {
    throw new Error(`图片删除失败: ${error.message}`)
  }
}

// 获取图片列表
async function getImageList(data) {
  const { category, limit = 20, skip = 0 } = data
  
  try {
    let query = db.collection('images').where({ status: 'active' })
    
    if (category) {
      query = query.where({ category: category })
    }

    const result = await query
      .orderBy('uploadTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()

    // 获取临时访问URL
    const fileIDs = result.data.map(item => item.fileID)
    if (fileIDs.length > 0) {
      const tempUrlResult = await cloud.getTempFileURL({
        fileList: fileIDs
      })

      const imagesWithUrls = result.data.map((item, index) => ({
        ...item,
        tempUrl: tempUrlResult.fileList[index]?.tempFileURL || ''
      }))

      return {
        success: true,
        images: imagesWithUrls,
        total: result.data.length
      }
    }

    return {
      success: true,
      images: result.data,
      total: result.data.length
    }
  } catch (error) {
    throw new Error(`获取图片列表失败: ${error.message}`)
  }
}