<script setup lang="ts">
// 隐私政策页：开源版不记录搜索词/身份标识/搜索日志，最小化收集
useSeoMeta({
  title: "隐私政策 - PanHub 网盘搜索",
  description: "PanHub 隐私政策：说明本站的数据收集与使用方式。",
  robots: "index,follow",
});
</script>

<template>
  <div class="privacy-page">
    <div class="privacy-card">
      <h1>隐私政策</h1>
      <p class="updated">更新日期：2026-09-05</p>

      <section>
        <h2>一、我们收集的信息</h2>
        <ul>
          <li>
            <strong>本站不记录你的搜索内容</strong>：搜索词不会被存储，也不会用于生成
            热搜榜单或任何统计展示。
          </li>
          <li>
            <strong>本站不存储你的身份信息</strong>：登录态校验由独立的认证服务
            （wx-auth）完成，本站只转发校验请求，不保存你的 openid、头像、昵称
            或其他身份资料。
          </li>
          <li>
            <strong>服务端运行日志</strong>：为保障服务可用性，服务端可能产生临时
            运行日志（如请求异常记录），仅用于故障定位，不与你的身份关联持久化。
          </li>
        </ul>
      </section>

      <section>
        <h2>二、信息的使用</h2>
        <ul>
          <li>提供搜索服务：关键词仅用于本次请求的实时检索，不落盘；</li>
          <li>登录态校验：认证服务仅返回"是否已认证"，本站不获得其余资料；</li>
          <li>基础限流：为防止滥用，服务端在内存中做短周期的请求频率限制，
            重启后即消失。</li>
        </ul>
      </section>

      <section>
        <h2>三、信息的存储与保留</h2>
        <p>
          本站不设用户数据库，不持久化存储搜索记录与个人身份信息。
          限流与配额计数仅存在于内存中（重启即清零）。
        </p>
      </section>

      <section>
        <h2>四、信息的共享</h2>
        <p>
          我们没有可共享的个人信息——因为本站不收集、不存储。登录态由认证服务
          （wx-auth）管理，其自身隐私政策请参阅该服务页面。
        </p>
      </section>

      <section>
        <h2>五、联系我们</h2>
        <p>
          如有隐私相关问题，可通过
          <a href="https://t.me/shenzjd_com" target="_blank" rel="noopener noreferrer">Telegram</a>
          或
          <a href="https://github.com/wu529778790/panhub.shenzjd.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          与我们联系。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.privacy-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 20px 64px;
  color: var(--text-color, #1f2937);
}
.privacy-card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 28px 32px;
  line-height: 1.8;
}
.privacy-card h1 {
  font-size: 24px;
  margin: 0 0 4px;
}
.privacy-card .updated {
  color: var(--muted-color, #6b7280);
  font-size: 13px;
  margin-bottom: 20px;
}
.privacy-card h2 {
  font-size: 17px;
  margin: 20px 0 8px;
}
.privacy-card ul {
  padding-left: 20px;
  margin: 8px 0;
}
.privacy-card li {
  margin: 4px 0;
}
.privacy-card a {
  color: var(--accent-color, #2563eb);
}
</style>
