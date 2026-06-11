# OKD4 Home Lab

> OKD 4.4 Bare Metal Cluster on KVM/QEMU  
> 改寫自 [Craig Robinson - OKD 4.4 on VMware](https://medium.com/@craig_robinson/openshift-4-4-okd-bare-metal-install-on-vmware-home-lab-6841ce2d37eb)，本版使用 KVM/QEMU

**🌐 Project Page**: [jimc1682000.github.io/okd4_files/](https://jimc1682000.github.io/okd4_files/)

---

## 架構

```
Internet
    │
[pfSense]  WAN: <home-network> / LAN: 192.168.1.1
    │
192.168.1.0/24 (OKD VLAN)
    ├── services  192.168.1.210   DNS · HAProxy · Apache · NFS (CentOS 7)
    ├── bootstrap 192.168.1.200   Fedora CoreOS  ← 安裝後移除
    ├── master1-3 192.168.1.201-203  Fedora CoreOS
    └── worker1-2 192.168.1.204-205  Fedora CoreOS
```

pfSense DHCP 以 MAC 靜態對應確保各 VM 取得固定 IP。

---

## Config Files

| 檔案 | 說明 |
|---|---|
| `install-config.yaml` | 叢集安裝設定（pullSecret / SSH key 需填入，含 SSH key 版已 gitignore） |
| `haproxy.cfg` | HAProxy：API 6443 / MCS 22623 / Ingress 80 443 |
| `db.okd.local` | BIND 正向 zone（所有節點 A records） |
| `db.192.168.1` | BIND 反向 zone（PTR records） |
| `named.conf` / `named.conf.local` | BIND 主設定 |
| `httpd.conf` | Apache port 8080（提供 ignition + FCOS image） |
| `ocp4-pxelinux.cfg_default` | PXE 開機選單 |
| `registry_pv.yaml` | Image Registry PV（NFS 100Gi） |
| `configmap-cluster-monitoring-config.yaml` | Prometheus / Alertmanager NFS 儲存 |
| `htpasswd_provider.yaml` | HTPasswd OAuth provider |
| `nfs.config` | NFS exports 設定 |

---

## 安裝步驟

### 1. 準備資源

```bash
# 下載清單
pfSense-CE-2.4.5-RELEASE-p1-amd64.iso.gz
fedora-coreos-31.x-metal.x86_64.raw.xz  (+.sig)
fedora-coreos-31.x-live.x86_64.iso
CentOS-7-x86_64-Minimal.iso
openshift-install-linux-4.4.0-0.okd-*.tar.gz
openshift-client-linux-4.4.0-0.okd-*.tar.gz
```

### 2. KVM 主機準備

使用兩台實體機（okd1/okd2）透過 XQuartz + X11 Forwarding 操作 virt-manager：

```bash
brew install --cask xquartz
ssh -X okd1-root
virt-manager
```

各 VM 使用 Intel e1000 網卡（避免驅動問題）。pfSense 需接兩張網卡（WAN + LAN）。

> ⚠️ **時區一致**：Services VM 時區必須與 KVM host 相同，否則 openshift-installer 產生的 TLS cert 時間錯誤，bootstrap 無法完成。

### 3. pfSense 設定

- WAN: `re0` / LAN: `re1` (192.168.1.1)
- DHCP: 啟用，range 192.168.1.10-100，**靜態 MAC 對應**各節點固定 IP
- NAT Port Forward: `8080 / 22 / 6443 / 443 / 80` → 192.168.1.210
- Firewall Rules: 開放 ICMP + 以上 port

### 4. Services VM（CentOS 7.8，192.168.1.210）

```bash
# 基本套件 + clone config
sudo yum install wget git -y && sudo yum update -y && sudo init 6
git clone https://github.com/jimc1682000/okd4_files.git

# === DNS (BIND) ===
sudo yum install bind bind-utils
sudo cp ~/okd4_files/db* /etc/named/zones/
sudo systemctl enable --now named
sudo firewall-cmd --permanent --add-port=53/udp && sudo firewall-cmd --reload

# === HAProxy（先停 NetworkManager 避免衝突）===
sudo systemctl stop NetworkManager && sudo systemctl disable NetworkManager
# vim /etc/sysconfig/network-scripts/ifcfg-<nic> → 設定靜態 IP
sudo yum install haproxy
sudo cp ~/okd4_files/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo setsebool -P haproxy_connect_any 1
sudo systemctl enable --now haproxy
sudo firewall-cmd --permanent --add-port=6443/tcp --add-port=22623/tcp \
  --add-service=http --add-service=https && sudo firewall-cmd --reload

# === Apache（port 8080，ignition server）===
sudo yum install -y httpd
# httpd.conf: Listen 8080
sudo setsebool -P httpd_read_user_content 1
sudo systemctl enable --now httpd
sudo firewall-cmd --permanent --add-port=8080/tcp && sudo firewall-cmd --reload

# === NFS（registry persistent storage）===
fdisk /dev/vdb          # n → p → enter×3 → w
sudo mkfs.ext4 /dev/vdb
sudo mkdir -p /var/nfsshare
sudo mount /dev/vdb /var/nfsshare
echo '/dev/vdb  /var/nfsshare  ext4  defaults  0  0' >> /etc/fstab
sudo yum install -y nfs-utils
sudo systemctl enable --now nfs-server rpcbind
sudo mkdir -p /var/nfsshare/registry
sudo chmod 777 -R /var/nfsshare
sudo chown nfsnobody:nfsnobody -R /var/nfsshare
sudo setsebool -P nfs_export_all_rw 1
echo '/var/nfsshare 192.168.1.0/24(rw,sync,no_root_squash,no_all_squash,no_wdelay)' \
  >> /etc/exports
sudo systemctl restart nfs-server
sudo firewall-cmd --permanent --zone=public \
  --add-service=mountd --add-service=rpc-bind --add-service=nfs
sudo firewall-cmd --reload
```

### 5. openshift-installer

```bash
# 下載並安裝工具（4.4.0-0.okd-2020-05-23-055148-beta5）
wget <openshift-client URL> && wget <openshift-install URL>
tar -zxvf openshift-client-*.tar.gz && tar -zxvf openshift-install-*.tar.gz
sudo mv oc kubectl openshift-install /usr/local/bin/

# 設定 install-config.yaml
mkdir ~/install_dir
cp ~/okd4_files/install-config.yaml ~/install_dir/
vim ~/install_dir/install-config.yaml
# sshKey: <cat ~/.ssh/id_rsa.pub>
# pullSecret: '{"auths":{"fake":{"auth": "bar"}}}'  ← 無 RH 帳號可用此 bypass

# 備份後產生 manifests（產生後 install-config.yaml 會被自動刪除）
cp ~/install_dir/install-config.yaml ~/install_dir/install-config.yaml.bak
openshift-install create manifests --dir=install_dir/
# 修改 mastersSchedulable: false
vim install_dir/manifests/cluster-scheduler-02-config.yml

# 產生 ignition configs + 部署到 Apache
openshift-install create ignition-configs --dir=install_dir/
sudo mkdir /var/www/html/okd4
sudo cp -R install_dir/* /var/www/html/okd4/
cd /var/www/html/okd4/
sudo wget <fedora-coreos-31.x-metal.x86_64.raw.xz URL>
sudo mv fedora-coreos-*.raw.xz fcos.raw.xz
sudo chown -R apache: /var/www/html/ && sudo chmod -R 755 /var/www/html/
# CHECKPOINT: curl localhost:8080/okd4/metadata.json
```

### 6. 建立叢集節點

流程：`bootstrap` → `master1-3` → 確認 bootstrap 完成 → 移除 bootstrap → `worker1-2` → 簽 CSR

**開機指令（FCOS live ISO 啟動後按 TAB）**：
```
coreos.inst.install_dev=/dev/sda
coreos.inst.image_url=http://192.168.1.210:8080/okd4/fcos.raw.xz
coreos.inst.ignition_url=http://192.168.1.210:8080/okd4/<bootstrap|master|worker>.ign
```

**確認 bootstrap 完成**：
```bash
openshift-install --dir=install_dir/ wait-for-bootstrap-complete --log-level=debug
# INFO It is now safe to remove the bootstrap resources
```

移除 bootstrap：從 `haproxy.cfg` 刪除 bootstrap backend → 重啟 HAProxy → `virsh destroy bootstrap`

**簽署 Worker CSR（需執行兩次）**：
```bash
export KUBECONFIG=~/install_dir/auth/kubeconfig
oc get csr -ojson | \
  jq -r '.items[] | select(.status == {}) | .metadata.name' | \
  xargs oc adm certificate approve
```

### 7. 驗收

```bash
oc get nodes               # 全部 Ready
oc get clusteroperators    # AVAILABLE: True

# Image Registry PV
oc create -f okd4_files/registry_pv.yaml
oc edit configs.imageregistry.operator.openshift.io
# managementState: Managed

# Web Console（需在本機 /etc/hosts 加入 pfSense WAN IP 對應）
# https://console-openshift-console.apps.lab.okd.local/
# kubeadmin / cat install_dir/auth/kubeadmin-password
```

---

## 相關資源

- [okd4-nginx — nginx on OKD4 範例](https://github.com/jimc1682000/okd4-nginx)
- [Craig Robinson 原文（VMware 版）](https://medium.com/@craig_robinson/openshift-4-4-okd-bare-metal-install-on-vmware-home-lab-6841ce2d37eb)
- [OKD 官方安裝文件](https://docs.okd.io/latest/installing/installing_bare_metal/installing-bare-metal.html)
