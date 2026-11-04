---
title: Linux 搭建 iSCSI 服务器流程
published: 2026-06-01
description: Linux 搭建 iSCSI 服务器流程
image: ""
tags:
  - 教程
  - linux
  - 系统
  - 硬盘
  - iscsi
  - target
category: 经验教程
alias: target-iscsi-server
lang: zh_CN
password: ""
passwordHint: ""
draft: false
pinned: 0
uid: a5603309-0287-4ede-bd4e-da87ac59d267
---

## Linux 搭建 iSCSI 服务器流程

### 与本地硬盘体验一致的云硬盘

1.安装服务端程序 `target`

版本: `Debian 12.5`

```bash
sudo apt install targetcli-fb
```

2.检查磁盘信息

```bash
sudo lsblk 分区信息
sudo fdisk -l 磁盘信息
```

3.iscsi 添加硬盘

```bash
进入子系统
sudo targetcli

列出虚拟菜单
ls
```

## **添加虚拟共享硬盘**

```bash
/backstores/block create name=MyDisk(共享名称) dev=/dev/sda3(分区名称)
/backstores/block create name=Misaka-Storage dev=/dev/sda1
```

添加 iscsi target 资源

```bash
/iscsi create wwn=iqn.2024-06.com.example:server 格式为: [格式].[年份]-[月份].com.[自定义名称]
/iscsi create wwn=iqn.2025-09.com.moe:server 格式为: [格式].[年份]-[月份].com.[自定义名称]
```

设置访问控制表 (ACL)

```bash
/iscsi/iqn.2024-06.com.moe:server/tpg1/acls create iqn.2025-09.com.moe:client  格式为: [名称]:[自定义名称]
/iscsi/iqn.2025-09.com.moe:server/tpg1/acls create iqn.2025-09.com.moe:client  格式为: [名称]:[自定义名称]
```

添加 luns 设备

```bash
/iscsi/iqn.2024-06.com.moe:server/tpg1/luns create /backstores/block/共享名称
/iscsi/iqn.2025-09.com.moe:server/tpg1/luns create /backstores/block/Misaka-Storage
```

设置 iscsi 服务端要监听的 IP(网卡)

```bash
/iscsi/iqn.2024-06.com.moe:server/tpg1/portals create 0.0.0.0:3260 监听本地主机所有的网卡
/iscsi/iqn.2025-09.com.moe:server/tpg1/portals create 0.0.0.0:3260 监听本地主机所有的网卡
```

4.启动 target 服务

```bash
sudo systemctl enable rtslib-fb-targetctl
sudo systemctl restart rtslib-fb-targetctl
```

## **Windows 添加 ISCSI 硬盘流程**

- 控制面板 -→Windows 工具 -→服务
- 在 Windows 操作系统中已开启 Microsoft iSCSI Initiator Service 服务
- 控制面板 -→Windows 工具 -→ISCSI 发起工具
- 点击发现选项卡 -→发现门户 输入服务器 IP 和端口
- 点击配置选项卡 -→点击更改,填入发起程序名称
- 点击目标选项卡 -→应该可以看到一条记录,点击连接

### 接下来打开控制面板 -→Windows 工具 -→计算机管理 -→磁盘管理 -- 可以看到添加的硬盘
