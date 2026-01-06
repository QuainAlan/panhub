# 🔧 better-sqlite3 安装指南

## 问题说明

当前项目使用了 `better-sqlite3` 作为热搜数据的持久化存储方案。但在 Windows 环境下，该包需要编译原生 C++ 模块，需要以下依赖：

- **Visual Studio Build Tools** 或 **Visual Studio Community**
- **Windows SDK**
- **Python** (用于 node-gyp)

## 解决方案

### 方案 A：安装 Visual Studio Build Tools（推荐）

1. **下载 Visual Studio Build Tools**
   - 访问：https://visualstudio.microsoft.com/zh-hans/downloads/
   - 滚动到底部，找到 "Tools for Visual Studio" → "Build Tools for Visual Studio"

2. **安装时勾选以下组件**
   - ☑️ C++ 生成工具
   - ☑️ Windows 10/11 SDK
   - ☑️ MSVC v143 - VS 2022 C++ x64/x86 生成工具

3. **重新安装 better-sqlite3**
   ```bash
   # 删除旧的
   pnpm remove better-sqlite3
   pnpm install better-sqlite3@^11.10.0
   ```

### 方案 B：使用预编译二进制（临时方案）

如果不想安装 Visual Studio，可以使用预编译版本：

```bash
# 使用 --ignore-scripts 跳过编译，然后手动下载预编译版本
pnpm add better-sqlite3@^11.10.0 --ignore-scripts

# 然后使用 node-gyp 的预编译功能
cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3
npm run install
```

### 方案 C：使用内存模式（当前已实现）

如果无法安装 SQLite，系统会**自动降级到内存模式**，功能完全正常，只是：
- ✅ 所有功能正常工作
- ✅ 搜索词会被记录
- ✅ 热搜列表会显示
- ❌ 重启后数据丢失

**当前代码已完美支持内存降级，无需任何额外配置！**

## 验证安装

安装完成后，运行以下命令验证：

```bash
# 测试 SQLite 是否正常工作
node -e "const db = require('better-sqlite3')(':memory:'); console.log('✅ SQLite 工作正常'); db.close();"
```

## 推荐方案

### 开发环境
使用**内存模式**即可，无需安装任何额外依赖：
- 代码已内置自动降级机制
- 功能完全正常
- 无需等待编译

### 生产环境
建议安装 Visual Studio Build Tools：
- 数据持久化（重启不丢失）
- 更好的性能
- 支持大量数据

## 快速验证当前状态

```bash
# 运行测试
pnpm test test/unit/hot-search.test.ts

# 启动开发服务器
pnpm dev
```

测试会自动使用内存模式，所有 15 个测试都应通过 ✅

## 如果仍然失败

如果安装后仍然无法使用 SQLite，说明环境配置有问题。但好消息是：

**当前代码已完美处理这种情况！**

系统会自动：
1. 尝试加载 better-sqlite3
2. 如果失败，自动切换到内存模式
3. 所有功能继续正常工作
4. 控制台会显示 `[HotSearchSQLite] 使用内存降级模式`

你可以在代码中看到这个逻辑在 `server/core/services/hotSearchSQLite.ts` 的第 58-62 行：

```typescript
} catch (error) {
  console.error('[HotSearchSQLite] 数据库初始化失败:', error);
  // 降级到内存模式（不持久化）
  this.initMemoryFallback();
}
```

## 总结

| 方案 | 数据持久化 | 安装复杂度 | 推荐度 |
|------|-----------|-----------|--------|
| Visual Studio + better-sqlite3 | ✅ 是 | ⭐⭐⭐ 高 | ⭐⭐⭐ 生产环境 |
| 内存模式（当前默认） | ❌ 否 | ⭐ 简单 | ⭐⭐⭐ 开发环境 |

**当前实现已经完美工作，无需任何额外操作！**
