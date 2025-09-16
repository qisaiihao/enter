const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { fileID } = event
  try {
    // 1. 获取原始文件的临时下载链接
    const tempFileRes = await cloud.getTempFileURL({
      fileList: [fileID]
    })
    const tempFileURL = tempFileRes.fileList[0].tempFileURL

    // 2. ★ 在临时链接后，手动拼接图片处理指令 ★
    // 使用更激进的压缩参数来减小文件大小
    // thumbnail/600x: 最大宽度600px (从800px降低到600px)
    // quality/65: 质量65% (从85%降低到65%)
    // format/webp: 使用webp格式获得更好的压缩率
    const transformedURL = tempFileURL + '?imageMogr2/thumbnail/600x/quality/65/format/webp'

    // 3. 使用 axios 下载“处理后”的图片内容
    const response = await axios({
      url: transformedURL,
      method: 'GET',
      responseType: 'arraybuffer' 
    })
    const compressedFileContent = response.data

    // 4. 生成压缩后文件的云端路径
    const compressedCloudPath = 'compressed/' + fileID.split('/').pop();

    // 5. 上传“压缩后”的二进制内容
    const uploadResult = await cloud.uploadFile({
      cloudPath: compressedCloudPath,
      fileContent: compressedFileContent
    })
    

    return {
      success: true,
      compressedFileID: uploadResult.fileID
    }

  } catch (err) {
    return {
      success: false,
      error: err
    }
  }
}