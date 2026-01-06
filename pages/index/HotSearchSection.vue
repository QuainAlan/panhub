<template>
  <div class="hot-search-section">
    <h2 class="section-title">热搜推荐</h2>

    <div class="categories-container">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <!-- 分类行列表 - 紧凑布局 -->
      <template v-else>
        <div
          v-for="category in categorizedData"
          :key="category.key"
          class="category-row compact"
        >
          <div class="category-header">
            <span class="category-icon">{{ category.icon }}</span>
            <span class="category-label">{{ category.label }}</span>
          </div>

          <div class="searches-tags">
            <button
              v-for="item in category.items"
              :key="item.term"
              class="tag-item"
              @click="onSearchClick(item.term)"
            >
              {{ item.term }}
            </button>
          </div>
        </div>
      </template>

      <!-- 空状态（所有分类都无数据） -->
      <div v-if="!loading && categorizedData.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>暂无热搜数据</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';

interface Props {
  onSearch: (term: string) => void;
}

interface CategoryConfig {
  key: string;
  label: string;
  icon: string;
  keywords: string[];
  maxDisplay: number;
  fallback: string[];
}

interface HotSearchItem {
  term: string;
  score: number;
  lastSearched: number;
  createdAt: number;
}

interface CategorizedResult {
  key: string;
  label: string;
  icon: string;
  items: HotSearchItem[];
}

const props = defineProps<Props>();

// 状态
const loading = ref(false);
const allSearches = ref<HotSearchItem[]>([]);

// 分类配置
const CATEGORIES: CategoryConfig[] = [
  {
    key: 'all',
    label: '全部',
    icon: '🔥',
    keywords: [],
    maxDisplay: 30,
    fallback: ['热门电影', '最新软件', '学习资料', '流行音乐', '热门游戏', '电子书', '车载HIFI', '4K电影', 'PS5游戏', 'Python教程', '雅思资料', '无损音乐', 'Adobe全家桶', '考研真题', 'Switch游戏', 'AI工具', 'Office2021', 'Blender教程', '周杰伦专辑', '黑神话悟空', '流浪地球3', 'VSCode插件', '雅思听力', 'FLAC音乐', 'Steam游戏', 'React教程', '剪映专业版', 'Excel技巧', 'PPT模板', '电子书下载']
  },
  {
    key: 'movie',
    label: '影视',
    icon: '🎬',
    keywords: ['电影', '剧集', '电视剧', '动漫', '动画', '纪录片', '综艺'],
    maxDisplay: 30,
    fallback: ['肖申克的救赎', '流浪地球3', '热辣滚烫', '飞驰人生2', '第二十条', '周处除三害', '繁花', '南来北往', '甄嬛传', '庆余年', '斗罗大陆', '斗破苍穹', '海贼王', '火影忍者', '进击的巨人', '鬼灭之刃', '咒术回战', '间谍过家家', '葬送的芙莉莲', '中国奇谭', '深海', '长安三万里', '封神', '孤注一掷', '八角笼中', '消失的她', '满江红', '无名', '长津湖', '水门桥']
  },
  {
    key: 'software',
    label: '软件',
    icon: '💻',
    keywords: ['软件', '工具', '应用', 'APP', '程序', '安装包'],
    maxDisplay: 30,
    fallback: ['Photoshop 2024', 'Office 2021', 'VS Code', 'Python 3.12', 'Blender', '剪映专业版', 'Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Final Cut Pro', 'Xmind', 'Notion', 'Obsidian', 'Typora', 'Navicat', 'Docker', 'Postman', 'Figma', 'Sketch', 'Chrome', 'Edge', 'Firefox', 'Bandizip', '7-Zip', 'IDM', 'Motrix', 'qBittorrent', 'uTorrent', 'VMware', 'VirtualBox']
  },
  {
    key: 'study',
    label: '学习',
    icon: '📚',
    keywords: ['学习', '资料', '教程', '课程', '文档', '电子书', '教材'],
    maxDisplay: 30,
    fallback: ['Python入门', 'React教程', '考研资料', '雅思真题', 'PPT模板', 'Excel技巧', 'Java基础', 'C++教程', 'Go语言', 'Rust入门', '前端开发', '后端架构', '数据库设计', '算法导论', 'LeetCode', '剑指Offer', '计算机网络', '操作系统', '编译原理', '深度学习', '机器学习', '数据分析', 'Web3', '区块链', 'Solidity', '以太坊', '比特币', 'NFT', '元宇宙', 'ChatGPT']
  },
  {
    key: 'music',
    label: '音乐',
    icon: '🎵',
    keywords: ['音乐', '歌曲', 'MP3', '无损', 'FLAC'],
    maxDisplay: 30,
    fallback: ['周杰伦', '林俊杰', '邓紫棋', '陈奕迅', '毛不易', '告五人', '薛之谦', '张杰', '李荣浩', '王菲', '张学友', '刘德华', '五月天', 'SHE', 'TFBOYS', '时代少年团', 'BLACKPINK', 'BTS', 'Taylor Swift', 'Billie Eilish', 'Ed Sheeran', 'Adele', 'Coldplay', 'Imagine Dragons', 'Maroon 5', 'Linkin Park', 'Eminem', 'Kanye West', 'Drake', 'The Weeknd']
  },
  {
    key: 'game',
    label: '游戏',
    icon: '🎮',
    keywords: ['游戏', 'Steam', '单机', '手游', '网游'],
    maxDisplay: 30,
    fallback: ['黑神话:悟空', '原神', '王者荣耀', '英雄联盟', 'CS2', '艾尔登法环', '赛博朋克2077', '巫师3', 'GTA5', '荒野大镖客2', '只狼', '怪物猎人', '塞尔达传说', '马里奥', '宝可梦', '最终幻想', '生化危机', '寂静岭', '逃生', '黎明杀机', '第五人格', '永劫无间', 'Apex英雄', '绝地求生', '堡垒之夜', '守望先锋', '瓦罗兰特', '炉石传说', '魔兽世界', '剑网3']
  }
];

// 计算属性：分类后的数据
const categorizedData = computed<CategorizedResult[]>(() => {
  // 如果没有真实数据，全部使用假数据
  if (allSearches.value.length === 0) {
    return CATEGORIES.map(cat => ({
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      items: cat.fallback.map(term => ({
        term,
        score: 0,
        lastSearched: 0,
        createdAt: 0
      }))
    }));
  }

  // 混合真实数据和假数据
  return CATEGORIES.map(cat => {
    // 过滤该分类的真实热搜
    const realItems = allSearches.value.filter(item =>
      cat.keywords.length === 0 ||
      cat.keywords.some(keyword => item.term.includes(keyword))
    );

    // 如果真实数据不足，用假数据补充
    const displayCount = cat.maxDisplay;
    let items = [...realItems];

    if (items.length < displayCount) {
      const needed = displayCount - items.length;
      const fallbackItems = cat.fallback.slice(0, needed).map(term => ({
        term,
        score: 0,
        lastSearched: 0,
        createdAt: 0
      }));
      items = [...items, ...fallbackItems];
    } else {
      items = items.slice(0, displayCount);
    }

    return {
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      items
    };
  });
});

// 获取热搜数据
async function fetchHotSearches() {
  loading.value = true;
  try {
    const response = await fetch('/api/hot-searches?limit=30');
    const data = await response.json();

    if (data.code === 0 && data.data?.hotSearches) {
      allSearches.value = data.data.hotSearches;
    }
  } catch (error) {
    console.error('获取热搜失败:', error);
    // 失败时使用假数据
    allSearches.value = [];
  } finally {
    loading.value = false;
  }
}

// 点击搜索词
function onSearchClick(term: string) {
  props.onSearch(term);
}

// 页面加载时获取数据
onMounted(() => {
  fetchHotSearches();
});
</script>

<style scoped>
.hot-search-section {
  width: 100%;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: '🔥';
  font-size: 24px;
}

.categories-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 分类行 - 水平紧凑布局 */
.category-row.compact {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  background: var(--bg-glass);
  backdrop-filter: blur(10px);
  animation: fadeIn 0.4s ease;
  flex-wrap: wrap;
}

/* 分类头部 - 紧凑 */
.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.category-icon {
  font-size: 18px;
}

.category-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

/* 标签式热搜词 - 简化样式 */
.searches-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.tag-item {
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  text-align: center;
}

.tag-item:hover {
  background: var(--bg-primary);
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-secondary);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-glass);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-lg);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

/* 动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 移动端优化 */
@media (max-width: 640px) {
  .section-title {
    font-size: 18px;
  }

  .category-row.compact {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
  }

  .category-header {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 6px;
    width: 100%;
  }

  .searches-tags {
    width: 100%;
  }

  .tag-item {
    padding: 5px 8px;
    font-size: 11px;
  }
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .category-row.compact {
    background: rgba(15, 23, 42, 0.6);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .tag-item {
    background: rgba(30, 41, 59, 0.5);
    border-color: rgba(100, 116, 139, 0.3);
  }

  .tag-item:hover {
    background: rgba(15, 23, 42, 0.7);
  }
}

/* 减少动画模式 */
@media (prefers-reduced-motion: reduce) {
  .category-row.compact,
  .tag-item {
    animation: none;
    transition: none;
  }

  .spinner {
    animation: none;
    opacity: 0.7;
  }

  .tag-item:hover {
    transform: none;
  }
}
</style>
