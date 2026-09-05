<template>
  <!-- 正常客户页面布局：导航/公告/浮窗 -->
  <!-- 顶部导航：接入 site-navbar Web Component（头像登录依赖 wx-auth-sdk，脚本见下方 useHead） -->
  <ClientOnly>
    <site-navbar></site-navbar>
  </ClientOnly>

  <!-- 公告条（2026-09-05 改造：内容由后端从官方站拉取（/api/announcement），多条轮播；
       单条超宽时左右来回滚动；关闭后不再显示，上游升级 version 后重新展示） -->
  <div v-if="showAnnouncement" class="announce-bar" role="status">
    <span class="announce-bar__icon" aria-hidden="true">📢</span>
    <div ref="viewportEl" class="announce-bar__viewport">
      <span :key="currentIndex" class="announce-bar__slide">
        <span
          ref="textEl"
          class="announce-bar__text"
          :class="{ 'announce-bar__text--scrolling': scrollDistance > 0 }"
          :style="scrollStyle"
        >
          <a
            v-if="currentItem?.link"
            :href="currentItem.link"
            target="_blank"
            rel="noopener"
          >{{ currentItem.text }}</a>
          <template v-else>{{ currentItem?.text }}</template>
        </span>
      </span>
    </div>
    <button class="announce-bar__close" type="button" @click="dismissAnnouncement" aria-label="关闭公告" title="关闭">✕</button>
  </div>

  <!-- 主内容区 -->
  <main class="main">
    <slot />
  </main>

  <!-- 页脚（隐私政策链接） -->
  <footer class="site-footer">
    <NuxtLink to="/privacy" class="footer-link">隐私政策</NuxtLink>
    <span class="footer-sep">·</span>
    <span class="footer-copy">© {{ new Date().getFullYear() }} PanHub</span>
  </footer>
</template>

<script setup lang="ts">
// 悬浮二维码 Web Component（公众号/赞赏码）：仅正常客户页面加载。
// 顶部导航 site-navbar Web Component + 头像登录依赖 wx-auth-sdk。
// 顺序：先 wx-auth-sdk（silent 静默校验登录态、required:false 可选认证），再 site-navbar。
// 该 UMD 全局单例（window.WxAuth，弹窗样式内联注入）是全站唯一
// SDK 实例：composables/useWxAuth.ts 复用它，不再打包 npm 版，
// SDK 发新版无需改本仓库依赖。搜索页 useWxAuth 会用强制认证配置重新 init。
useHead({
  script: [
    {
      src: "https://unpkg.com/wx-auth-sdk/dist/wx-auth.umd.js",
      body: true,
    },
    {
      innerHTML: `WxAuth.init({ silent: true, required: false })`,
      body: true,
    },
    {
      src: "https://unpkg.com/@wu529778790/site-navbar@latest/dist/site-navbar.wc.js",
      body: true,
    },
    {
      src: "https://unpkg.com/@wu529778790/floating-qr@latest/dist/floating-qr.wc.js",
      body: true,
    },
  ],
});

const { loadSettings } = useSettings();

onMounted(() => {
  loadSettings();
  loadAnnouncements();
});

// 公告条（2026-09-05 起为跑马灯）：
//   - 内容来自本站 /api/announcement（后端服务端拉取官方站，公告不在开源仓库维护）；
//   - 多条公告每 6s 轮播一条，单条一行放不下时左右来回滚动（hover 暂停）；
//   - 关闭按 version 记忆（上游升级 version 后已关闭用户会重新看到）；
//   - 接口失败或无有效公告时整条隐藏，不影响页面。
interface AnnouncementItem {
  id: string;
  text: string;
  link?: string;
}
interface AnnouncementPayload {
  version: number;
  items: AnnouncementItem[];
}
const ANNOUNCEMENT_KEY_PREFIX = "panhub:announcement-dismissed:v";
const ROTATE_INTERVAL_MS = 6000;

const showAnnouncement = ref(false);
const announcements = ref<AnnouncementItem[]>([]);
const announcementVersion = ref(0);
const currentIndex = ref(0);
const viewportEl = ref<HTMLElement | null>(null);
const textEl = ref<HTMLElement | null>(null);
const scrollDistance = ref(0); // >0 表示当前条目超宽，需要来回滚动
let rotateTimer: ReturnType<typeof setInterval> | null = null;

const currentItem = computed(() => announcements.value[currentIndex.value] ?? null);

const scrollStyle = computed(() => {
  if (scrollDistance.value <= 0) return {};
  const duration = Math.max(6, Math.round(scrollDistance.value / 30));
  return {
    "--announce-scroll-distance": `-${scrollDistance.value}px`,
    "--announce-scroll-duration": `${duration}s`,
  };
});

async function loadAnnouncements() {
  let data: AnnouncementPayload | null = null;
  try {
    const res = await $fetch<{ code: number; data: AnnouncementPayload }>(
      `${useRuntimeConfig().public.apiBase}/announcement`
    );
    if (res?.code === 0 && Array.isArray(res.data?.items) && res.data.items.length > 0) {
      data = res.data;
    }
  } catch {}
  if (!data) return;

  announcements.value = data.items;
  announcementVersion.value = data.version;
  try {
    if (localStorage.getItem(`${ANNOUNCEMENT_KEY_PREFIX}${data.version}`)) return;
  } catch {}
  showAnnouncement.value = true;

  if (data.items.length > 1) {
    rotateTimer = setInterval(() => {
      currentIndex.value = (currentIndex.value + 1) % announcements.value.length;
    }, ROTATE_INTERVAL_MS);
  }
  await nextTick();
  measureScroll();
}

// 超宽判定：文本实际宽度超出视口可视宽度才启用左右滚动动画
function measureScroll() {
  const vp = viewportEl.value;
  const tx = textEl.value;
  if (!vp || !tx) {
    scrollDistance.value = 0;
    return;
  }
  const dist = Math.ceil(tx.scrollWidth - vp.clientWidth);
  scrollDistance.value = dist > 4 ? dist : 0;
}

watch(currentIndex, () => {
  nextTick(measureScroll);
});

function onResize() {
  if (showAnnouncement.value) measureScroll();
}
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  if (rotateTimer) {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
});

function dismissAnnouncement() {
  showAnnouncement.value = false;
  try {
    localStorage.setItem(`${ANNOUNCEMENT_KEY_PREFIX}${announcementVersion.value}`, "1");
  } catch {}
}
</script>

<style scoped>
/* 顶部导航已接入 site-navbar Web Component，样式由组件自带，此处不再维护 */

/* 公告条（全宽细条，导航栏下方） */
.announce-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 7px 16px;
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border-bottom: 1px solid rgba(15, 118, 110, 0.12);
  font-size: 13px;
  color: var(--text-secondary, #4b5563);
  line-height: 1.5;
  animation: barSlideIn 0.3s ease;
}
.announce-bar__icon {
  flex-shrink: 0;
}
/* 跑马灯视口：跟随文字宽度居中（图标贴着公告）；
   文字超宽时收缩为剩余可用宽度，超出部分隐藏，由 JS 测宽判定是否滚动 */
.announce-bar__viewport {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-align: center;
}
.announce-bar__slide {
  display: inline-block;
  max-width: 100%;
  animation: barSlideIn 0.3s ease;
}
.announce-bar__text {
  display: inline-block;
  white-space: nowrap;
}
.announce-bar__text a {
  color: var(--primary, #0f766e);
  text-decoration: underline;
}
/* 超宽来回滚动（alternate 往返）；hover 暂停方便阅读/点链接 */
.announce-bar__text--scrolling {
  animation: announceBounce var(--announce-scroll-duration, 12s) ease-in-out infinite alternate;
  will-change: transform;
}
.announce-bar__viewport:hover .announce-bar__text--scrolling {
  animation-play-state: paused;
}
.announce-bar__text strong {
  color: var(--primary, #0f766e);
}
.announce-bar__close {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.announce-bar__close:hover {
  color: var(--text-secondary, #4b5563);
}
@keyframes barSlideIn {
  from {
    transform: translateY(-4px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes announceBounce {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(var(--announce-scroll-distance, -100px));
  }
}

/* 页脚（隐私政策链接，2026-08-26 从 app.vue 移入：仅客户页布局显示，admin 后台不显示） */
.site-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 16px 28px;
  font-size: 13px;
  color: var(--text-tertiary, #9ca3af);
}
.footer-link {
  color: var(--text-secondary, #6b7280);
  text-decoration: none;
}
.footer-link:hover {
  color: var(--accent, #2563eb);
}
.footer-sep {
  opacity: 0.5;
}
</style>
