# 云函数部署指南

## 需要上传的云函数列表

### 1. getMessages
- 功能：获取用户消息列表
- 文件：`cloudfunctions/getMessages/`

### 2. getUnreadMessageCount  
- 功能：获取未读消息数量
- 文件：`cloudfunctions/getUnreadMessageCount/`

### 3. markMessagesAsRead
- 功能：标记消息为已读
- 文件：`cloudfunctions/markMessagesAsRead/`

### 4. deleteMessage
- 功能：删除单条消息
- 文件：`cloudfunctions/deleteMessage/`

### 5. clearAllMessages
- 功能：清空所有消息
- 文件：`cloudfunctions/clearAllMessages/`

## 数据库集合结构

### messages 集合
```json
{
  "_id": "string",           // 消息ID
  "fromUserId": "string",    // 发送者用户ID
  "toUserId": "string",      // 接收者用户ID  
  "type": "string",          // 消息类型：like, comment, favorite
  "postId": "string",        // 相关帖子ID
  "postTitle": "string",     // 帖子标题
  "content": "string",       // 消息内容
  "isRead": "boolean",       // 是否已读
  "createTime": "Date",      // 创建时间
  "readTime": "Date"         // 读取时间
}
```

## 部署步骤

### 1. 上传云函数
在微信开发者工具中：
1. 打开「云开发」面板
2. 点击「云函数」
3. 右键点击每个云函数文件夹
4. 选择「上传并部署：云端安装依赖」

### 2. 创建数据库集合
1. 打开「云开发」面板
2. 点击「数据库」
3. 点击「+」创建集合
4. 输入集合名称：`messages`
5. 设置权限：所有用户可读，仅创建者可写

### 3. 创建索引（可选，提升性能）
为以下字段创建索引：
- `toUserId` + `createTime` （复合索引，降序）
- `toUserId` + `isRead` （复合索引）

### 4. 触发器设置（可选）
可以设置数据库触发器，当用户点赞/评论/收藏时自动创建消息记录。

## 权限设置建议

### messages 集合权限
```json
{
  "read": "doc.toUserId == auth.openid",
  "write": "doc.toUserId == auth.openid || doc.fromUserId == auth.openid"
}
```

## 测试验证

部署完成后，可以通过以下方式测试：
1. 让用户A点赞用户B的帖子
2. 检查用户B的消息列表是否显示该点赞通知
3. 验证未读消息数量是否正确更新