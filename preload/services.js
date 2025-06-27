const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const Database = require('better-sqlite3')
const { exec } = require('node:child_process')

window.exports = {
  "cursor": {
    mode: 'list',
    args: {
      enter: (action, callbackSetList) => {
        const list = window.services.getCursorRecentFolders()
        callbackSetList(list)
      },
      search: (action, searchWord, callbackSetList) => {
        const list = window.services.getCursorRecentFolders()
        callbackSetList(list.filter(item => item.title.includes(searchWord)))
      },
      select: (action, itemData, callbackSetList) => {
        window.services.openFolder(itemData.description)
        window.utools.outPlugin()
      },
      placeholder: "搜索Cursor最近打开的文件夹",
    }
  }
}

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 解析Cursor的state.vscdb文件，获取最近打开的文件夹列表
  getCursorRecentFolders() {
    let db = null
    try {
      // 获取Cursor用户数据目录路径
      const userHome = os.homedir()
      let cursorConfigPath

      // 根据操作系统确定配置文件路径
      if (process.platform === 'win32') {
        cursorConfigPath = path.join(userHome, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      } else if (process.platform === 'darwin') {
        cursorConfigPath = path.join(userHome, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      } else {
        // Linux
        cursorConfigPath = path.join(userHome, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      }

      // 检查文件是否存在
      if (!fs.existsSync(cursorConfigPath)) {
        throw new Error('Cursor配置文件未找到: ' + cursorConfigPath)
      }

      // 使用better-sqlite3打开数据库
      db = new Database(cursorConfigPath, { readonly: true })

      // 查询最近打开的文件夹列表
      // VSCode/Cursor的state.vscdb通常将数据存储在ItemTable表中
      const stmt = db.prepare("SELECT value FROM ItemTable WHERE key LIKE '%history.recentlyOpenedPathsList%'")
      const rows = stmt.get()

      console.log('查询结果:', rows)
      const recentFolders = JSON.parse(rows.value).entries

      // 转成base64
      const logoPath = path.join(__dirname, '../icon.png')
      const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' })

      // 过滤并格式化文件夹路径
      return recentFolders
        .filter(item => item && item.folderUri)
        .map(item => {
          let folderPath = item.folderUri
          // 处理file://协议
          if (folderPath.startsWith('file:///')) {
            folderPath = folderPath.replace(/^file:\/\/\//, '')
          } else if (folderPath.startsWith('file://')) {
            folderPath = folderPath.replace(/^file:\/\//, '')
          }

          // URL解码
          folderPath = decodeURIComponent(folderPath)

          // Windows路径处理
          if (process.platform === 'win32' && folderPath.match(/^[a-zA-Z]:/)) {
            // 路径已经是正确的Windows格式
          } else if (process.platform === 'win32') {
            // 可能需要添加盘符或处理UNC路径
            folderPath = folderPath.replace(/^\/([a-zA-Z]):/, '$1:')
          }

          return {
            title: path.basename(folderPath),
            description: folderPath,
            icon: 'data:image/png;base64,' + logoBase64
          }
        })

    } catch (error) {
      console.error('解析Cursor配置文件失败:', error)
      return []
    } finally {
      // 确保关闭数据库连接
      if (db) {
        try {
          db.close()
        } catch (closeError) {
          console.warn('关闭数据库连接失败:', closeError)
        }
      }
    }
  },
  openFolder(path) {
    // 使用cursor命令打开文件夹
    const cursorCommand = `cursor ${path}`
    exec(cursorCommand, (error, stdout, stderr) => {
      // 检查是否发生错误
      if (error) {
        console.error(`执行命令时出错: ${error.message}`);
        console.error('--- 故障排查 ---');
        console.error("1. 确保 'cursor' 命令已经在系统的 PATH 环境变量中。");
        console.error("2. 你可以在 Cursor 中打开命令面板 (Ctrl+Shift+P)，然后运行 'Shell Command: Install 'cursor' command in PATH' 来安装它。");
        console.error("3. 如果仍然失败，请尝试在脚本中使用 Cursor 的完整可执行文件路径。");
        return;
      }
      // 检查是否有标准错误输出（例如警告信息）
      if (stderr) {
        console.warn(`命令执行产生标准错误: ${stderr}`);
      }
      // 打印标准输出（如果有的话）
      console.log(`命令标准输出: ${stdout}`);
      console.log(`✅ 命令执行成功！Cursor 应该已经开始打开文件夹: ${path}`);
    });
  }
}
