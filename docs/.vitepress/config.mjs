import { defineConfig } from "vitepress";

export default defineConfig({
  title: "OKD4 Home Lab",
  description: "KVM/QEMU Bare Metal OKD 4.4 Cluster",
  base: "/okd4_files/",
  srcDir: ".",
  outDir: "../dist",
  head: [
    [
      "script",
      {},
      `(function(){try{var t=localStorage.getItem("lab.theme");document.documentElement.setAttribute("data-theme",t||"dark")}catch(e){}})()`,
    ],
  ],
  themeConfig: {},
});
