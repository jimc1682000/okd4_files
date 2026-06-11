<script setup>
import { useData } from "vitepress";
import { ref, onMounted, onUnmounted, nextTick } from "vue";

const { frontmatter } = useData();

const theme = ref("dark");
const scrolled = ref(false);
let cleanup = [];
let io = null;

function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme.value);
}
function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  try { localStorage.setItem("lab.theme", theme.value); } catch (_) {}
  applyTheme();
}

function reveal() {
  const els = document.querySelectorAll(".lab-content .reveal");
  if (io) io.disconnect();
  io = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }),
    { threshold: 0.06 }
  );
  els.forEach((el, i) => {
    el.style.setProperty("--d", (i % 5) * 60 + "ms");
    io.observe(el);
  });
}

onMounted(() => {
  const stored = typeof localStorage !== "undefined" && localStorage.getItem("lab.theme");
  theme.value = stored || document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme();
  nextTick(reveal);

  const onScroll = () => { scrolled.value = window.scrollY > 8; };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  cleanup.push(() => window.removeEventListener("scroll", onScroll));
});
onUnmounted(() => { if (io) io.disconnect(); cleanup.forEach((fn) => fn()); cleanup = []; });
</script>

<template>
  <div class="lab-shell">
    <div class="aurora" aria-hidden="true"><div class="aurora-3"></div></div>

    <!-- toolbar -->
    <nav class="toolbar" :class="{ scrolled }">
      <a class="t-brand" href="https://github.com/jimc1682000/okd4_files" target="_blank" rel="noopener">
        OKD4 Home Lab <span class="badge">KVM / QEMU</span>
      </a>
      <div class="t-ctrls">
        <a href="https://github.com/jimc1682000/okd4_files" target="_blank" rel="noopener">GitHub</a>
        <a href="https://github.com/jimc1682000/okd4-nginx" target="_blank" rel="noopener">nginx Demo</a>
        <button class="t-icon" @click="toggleTheme" :aria-label="theme === 'dark' ? 'Light mode' : 'Dark mode'">
          <svg v-if="theme==='dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </button>
      </div>
    </nav>

    <div class="lab-content">
      <!-- hero -->
      <section class="hero reveal">
        <h1>OKD4 Home Lab</h1>
        <p class="sub">在兩台實體機上以 KVM/QEMU 部署生產級 OKD 4.4 叢集<br>Bare metal OpenShift-upstream cluster for learning &amp; lab use</p>
        <div class="hero-tags">
          <span v-for="t in frontmatter.tech" :key="t">{{ t }}</span>
        </div>
        <div class="hero-links">
          <a class="btn-primary" href="https://github.com/jimc1682000/okd4_files" target="_blank" rel="noopener">Config Files</a>
          <a class="btn-ghost" href="https://github.com/jimc1682000/okd4-nginx" target="_blank" rel="noopener">nginx on OKD4</a>
          <a class="btn-ghost" href="https://medium.com/@craig_robinson/openshift-4-4-okd-bare-metal-install-on-vmware-home-lab-6841ce2d37eb" target="_blank" rel="noopener">Reference Article</a>
        </div>
      </section>

      <!-- architecture -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">🏗</span> 網路架構</div>
        <div class="card">
          <pre class="arch-block">Internet
    │
[pfSense]  WAN: &lt;home-network&gt; / LAN: 192.168.1.1
    │
    ├── 192.168.1.0/24 (OKD VLAN)
    │       │
    │       ├── [services]  192.168.1.210   DNS(BIND) · HAProxy · Apache · NFS
    │       ├── [bootstrap] 192.168.1.200   Fedora CoreOS  ← 安裝完即移除
    │       ├── [master1]   192.168.1.201   Fedora CoreOS
    │       ├── [master2]   192.168.1.202   Fedora CoreOS
    │       ├── [master3]   192.168.1.203   Fedora CoreOS
    │       ├── [worker1]   192.168.1.204   Fedora CoreOS
    │       └── [worker2]   192.168.1.205   Fedora CoreOS
    │
pfSense DHCP → MAC 靜態對應 → 確保每台 VM 取得固定 IP</pre>
        </div>
      </section>

      <!-- vm specs -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">🖥</span> VM 規格</div>
        <div class="card" style="overflow-x:auto">
          <table class="vm-table">
            <thead>
              <tr><th>Node</th><th>Role</th><th>OS</th><th>vCPU</th><th>RAM</th><th>Storage</th><th>IP</th></tr>
            </thead>
            <tbody>
              <tr v-for="vm in frontmatter.vms" :key="vm.name">
                <td><code style="font-size:.75rem">{{ vm.name }}</code></td>
                <td><span class="chip" :class="vm.cls">{{ vm.role }}</span></td>
                <td style="font-size:.75rem;color:var(--text2)">{{ vm.os }}</td>
                <td>{{ vm.cpu }}</td>
                <td>{{ vm.ram }}</td>
                <td>{{ vm.disk }}</td>
                <td><code style="font-size:.73rem">{{ vm.ip }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- install steps -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">📋</span> 安裝流程</div>
        <div class="card">
          <div class="steps">
            <div class="step" v-for="(s, i) in frontmatter.steps" :key="i">
              <div class="step-num">{{ i + 1 }}</div>
              <div class="step-body">
                <h3>{{ s.title }}</h3>
                <p>{{ s.desc }}</p>
                <ul v-if="s.items" style="margin-top:.4rem">
                  <li v-for="item in s.items" :key="item">{{ item }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- cluster bootstrap commands -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">⚡</span> 關鍵指令</div>
        <div class="card-grid">
          <div class="card" v-for="cmd in frontmatter.cmds" :key="cmd.label">
            <div class="code-label">{{ cmd.label }}</div>
            <pre class="code-block" v-html="cmd.code"></pre>
          </div>
        </div>
      </section>

      <!-- config files -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">📁</span> Config Files</div>
        <div class="file-grid">
          <div class="file-item" v-for="f in frontmatter.files" :key="f.name">
            <span class="file-icon">{{ f.icon }}</span>
            <div>
              <div class="file-name">{{ f.name }}</div>
              <div class="file-desc">{{ f.desc }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- nginx on okd4 -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">🐳</span> nginx on OKD4</div>
        <div class="nginx-demo">
          <div class="card">
            <div class="code-label">Dockerfile</div>
            <pre class="code-block"><span class="c"># non-privileged nginx for OpenShift</span>
FROM nginx:stable

RUN chmod g+rwx \
      /var/cache/nginx \
      /var/run \
      /var/log/nginx
<span class="c"># OKD 不允許監聽 privileged port</span>
RUN sed -i.bak \
  's/listen\(.*\)80;/listen 8081;/' \
  /etc/nginx/conf.d/default.conf
EXPOSE 8081</pre>
          </div>
          <div class="card">
            <div class="code-label">Deploy to OKD4</div>
            <pre class="code-block"><span class="c"># 建立應用</span>
oc new-app \
  jimc1682000/okd4-nginx

<span class="c"># expose service</span>
oc expose svc/okd4-nginx

<span class="c"># 查看路由</span>
oc get route okd4-nginx

<span class="c"># 進入 pod</span>
oc exec -it \
  $(oc get pod -l app=okd4-nginx \
    -o name) -- /bin/sh</pre>
          </div>
        </div>
        <div style="margin-top:.75rem;font-size:.8rem;color:var(--text2)">
          OKD/OpenShift 以任意 UID 執行 pod，nginx 預設的 root + port 80 需調整才能正常運作。
        </div>
      </section>

      <!-- takeaways -->
      <section class="section reveal">
        <div class="section-title"><span class="ico">💡</span> 關鍵經驗</div>
        <div class="insight-grid">
          <div class="insight-item" v-for="ins in frontmatter.insights" :key="ins.title">
            <h4>{{ ins.title }}</h4>
            <p>{{ ins.desc }}</p>
          </div>
        </div>
      </section>
    </div>

    <footer class="lab-footer">
      <a href="https://github.com/jimc1682000/okd4_files" target="_blank" rel="noopener">okd4_files</a>
      <span style="margin:0 .5rem">·</span>
      <a href="https://github.com/jimc1682000/okd4-nginx" target="_blank" rel="noopener">okd4-nginx</a>
      <span style="margin:0 .5rem">·</span>
      <a href="https://jimc1682000.github.io" target="_blank" rel="noopener">jimc1682000.github.io</a>
    </footer>
  </div>
</template>
