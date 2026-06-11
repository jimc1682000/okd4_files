---
layout: okd4lab
tech:
  - OKD 4.4
  - Fedora CoreOS
  - KVM / QEMU
  - pfSense
  - HAProxy
  - BIND DNS
  - Apache httpd
  - NFS
  - CentOS 7
  - Kubernetes

vms:
  - { name: bootstrap,  role: Bootstrap, cls: chip-boot,   os: "Fedora CoreOS", cpu: 4, ram: 16G, disk: 120G, ip: "192.168.1.200" }
  - { name: master1,    role: Master,    cls: chip-master,  os: "Fedora CoreOS", cpu: 4, ram: 16G, disk: 120G, ip: "192.168.1.201" }
  - { name: master2,    role: Master,    cls: chip-master,  os: "Fedora CoreOS", cpu: 4, ram: 16G, disk: 120G, ip: "192.168.1.202" }
  - { name: master3,    role: Master,    cls: chip-master,  os: "Fedora CoreOS", cpu: 4, ram: 16G, disk: 120G, ip: "192.168.1.203" }
  - { name: worker1,    role: Worker,    cls: chip-worker,  os: "Fedora CoreOS", cpu: 2, ram: 8G,  disk: 120G, ip: "192.168.1.204" }
  - { name: worker2,    role: Worker,    cls: chip-worker,  os: "Fedora CoreOS", cpu: 2, ram: 8G,  disk: 120G, ip: "192.168.1.205" }
  - { name: services,   role: DNS/LB/NFS,cls: chip-svc,    os: "CentOS 7",      cpu: 2, ram: 2G,  disk: "20+100G", ip: "192.168.1.210" }
  - { name: pfsense,    role: Router,    cls: chip-svc,    os: "FreeBSD",       cpu: 2, ram: 1G,  disk: 8G,   ip: "WAN / 192.168.1.1" }

steps:
  - title: "準備 ISO 與工具"
    desc: "下載所有需要的安裝媒體與 OKD 工具"
    items:
      - "pfSense CE 2.4.5 ISO"
      - "Fedora CoreOS 31 metal raw.xz + sig"
      - "Fedora CoreOS 31 live ISO（用於安裝節點）"
      - "CentOS 7 Minimal ISO"
      - "openshift-install + openshift-client 4.4.0-0.okd"

  - title: "KVM 主機準備"
    desc: "在兩台實體機（okd1/okd2）設定 SSH key 登入、時區統一、確認外網連線。透過 XQuartz + X11 Forwarding 在本機操作遠端 virt-manager 建立 VM。"
    items:
      - "ssh-keygen + authorized_keys 設定"
      - "hostnamectl set-hostname okd1 / okd2"
      - "brew install --cask xquartz"
      - "ssh -X okd1-root → virt-manager"

  - title: "pfSense Router/DHCP"
    desc: "建立 pfSense VM（雙網卡：WAN + LAN）。設定 DHCP Static Mapping 確保各節點取得固定 IP；NAT Port Forward 8080/22/6443/443/80 至 services VM。"

  - title: "Services VM（CentOS 7.8）"
    desc: "安裝 DNS(BIND)、HAProxy、Apache(port 8080)、NFS（100G partition）。時區需與 KVM 主機一致，否則 openshift-installer 產生的 TLS cert 會有問題。"
    items:
      - "BIND：clone okd4_files → cp db* /etc/named/zones/"
      - "HAProxy：停用 NetworkManager 改用靜態 ifcfg"
      - "Apache：port 8080 提供 ignition + FCOS image"
      - "NFS：fdisk → mkfs.ext4 → /var/nfsshare 給 registry PV"

  - title: "openshift-installer"
    desc: "設定 install-config.yaml（填入 pull secret + SSH pubkey），產生 manifests，修改 mastersSchedulable: false，產生 ignition configs，複製到 Apache web root。"
    items:
      - "openshift-install create manifests --dir=install_dir/"
      - "cluster-scheduler-02-config.yml → mastersSchedulable: false"
      - "openshift-install create ignition-configs --dir=install_dir/"
      - "cp -R install_dir/* /var/www/html/okd4/ + wget FCOS raw.xz"

  - title: "建立叢集節點"
    desc: "依序啟動 bootstrap → master1-3 → worker1-2。每台 VM 開機按 TAB 輸入 coreos.inst.* 參數指向 Apache 上的 ignition URL 與 FCOS image URL。"
    items:
      - "確認 bootstrap 完成：openshift-install wait-for-bootstrap-complete"
      - "移除 HAProxy 中的 bootstrap backend，virsh destroy bootstrap"
      - "簽署 worker CSR：oc get csr -ojson | jq ... | xargs oc adm certificate approve（兩次）"
      - "oc get nodes + oc get clusteroperators 全部 Ready/Available"

  - title: "後續設定"
    desc: "建立 Image Registry PV（NFS 100Gi）、設定 HTPasswd 認證、監控儲存（Prometheus/Alertmanager），登入 Web Console 驗收。"

cmds:
  - label: "Bootstrap 節點安裝（開機時按 TAB）"
    code: "coreos.inst.install_dev=/dev/sda\ncoreos.inst.image_url=http://192.168.1.210:8080/okd4/fcos.raw.xz\ncoreos.inst.ignition_url=http://192.168.1.210:8080/okd4/bootstrap.ign"
  - label: "確認 bootstrap 完成"
    code: "openshift-install --dir=install_dir/ \\\n  wait-for-bootstrap-complete \\\n  --log-level=debug"
  - label: "簽署 Worker CSR（執行兩次）"
    code: "export KUBECONFIG=~/install_dir/auth/kubeconfig\noc get csr -ojson | \\\n  jq -r '.items[] | \n    select(.status == {}) | \n    .metadata.name' | \\\n  xargs oc adm certificate approve"
  - label: "確認叢集就緒"
    code: "oc get nodes\n# 全部 Ready\noc get clusteroperators\n# AVAILABLE: True"

files:
  - { icon: "⚙️",  name: "install-config.yaml",  desc: "叢集安裝設定（pullSecret / SSH key 填入後 gitignore）" }
  - { icon: "⚖️",  name: "haproxy.cfg",           desc: "HAProxy：API 6443 / MCS 22623 / Ingress 80/443" }
  - { icon: "🌐",  name: "db.okd.local",           desc: "BIND 正向 DNS zone（A records for all nodes）" }
  - { icon: "🔁",  name: "db.192.168.1",           desc: "BIND 反向 DNS zone（PTR records）" }
  - { icon: "📝",  name: "named.conf",             desc: "BIND 主設定 + named.conf.local" }
  - { icon: "🌍",  name: "httpd.conf",             desc: "Apache port 8080 設定（提供 ignition + FCOS image）" }
  - { icon: "🖥",  name: "ocp4-pxelinux.cfg_default", desc: "PXE 開機選單（PXE 替代方案）" }
  - { icon: "💾",  name: "registry_pv.yaml",       desc: "Image Registry PersistentVolume（NFS 100Gi）" }
  - { icon: "📊",  name: "configmap-cluster-monitoring-config.yaml", desc: "Prometheus / Alertmanager NFS 儲存" }
  - { icon: "🔐",  name: "htpasswd_provider.yaml", desc: "HTPasswd OAuth identity provider" }
  - { icon: "📤",  name: "nfs.config",             desc: "NFS exports（/var/nfsshare 192.168.1.0/24）" }

insights:
  - title: "時區一致性"
    desc: "Services VM 時區必須與 KVM host 完全一致，否則 openshift-installer 產生的 TLS cert 時間有誤，bootstrap 永遠無法完成。"
  - title: "NetworkManager 衝突"
    desc: "CentOS 7 的 HAProxy 重啟時會觸發 NetworkManager 重置網路，需停用 NM 改用靜態 ifcfg 設定。"
  - title: "CSR 要簽兩次"
    desc: "Worker node 加入需簽署兩輪 CSR：第一輪是 openshift-machine-config-operator 的，第二輪才是 worker 本身。"
  - title: "install-config 備份"
    desc: "openshift-install 產生 manifests 後會自動刪除 install-config.yaml，務必在執行前先備份。"
  - title: "nginx port 限制"
    desc: "OKD pod 以任意 UID 執行，nginx 需從 port 80 改為 8081+ 並開放 /var/cache/nginx 等目錄的 group 寫入。"
  - title: "Bootstrap 移除時機"
    desc: "wait-for-bootstrap-complete 顯示 complete 後，需立刻從 HAProxy cfg 移除 bootstrap backend 再重啟，否則 API 健康檢查會持續失敗。"
---
