---
title: Git 笔记
description: 常用 git 命令
published: 2026-07-04
image: ./images/2026/07/git-1783161331740.webp
tags:
  - git
category: 文章
alias: []
lang: zh_CN
password: ""
passwordHint: ""
draft: false
pinned: 0
uid: 07303c0b-1f15-46ce-acc4-cf41ee8f61a3
---

## 想删除不再追踪的文件

递归删除所有已追踪文件的 Git 缓存（核心命令）

    `git rm -r --cached . `

重新添加所有文件（自动遵循 .gitignore 规则）

    `git add . `

提交变更

    `git commit -m "chore: 清理 .gitignore 缓存，停止追踪忽略文件"`

覆盖最后一次提交

    `git commit --amend --no-edit`

查看详细远程地址

    `git remote -v`

## 设置 ssh 连接,避免 https 连接错误

    `git remote set-url origin git@github.com:用户名/仓库.git`

注意.gitconfig 文件的全局配置可能会影响 ssh 配置

配置 ssh

    `ssh-keygen -t ed25519 -C "email or 备注"`

查看公钥

    `cat ~/.ssh/id_ed25519.pub`

把公钥复制到 github

授权本机

    `ssh-agent bash`

    `ssh-add ~/.ssh/id_ed25519`

测试

    `ssh -T git@github.com`

## git 全局设置

    `git config --global user.name "用户名"`
    `git config --global user.email "邮箱"`

显示所有设置

    `git config --global --list`

ssh 记住账号自动验证

    `git config --global credential.helper store`

自动变基

    `git config --global pull.rebase true`

添加信任目录

    `git config --global --add safe.directory '*'`

自动转换 CRLF 为 LF（提交时）和 LF 为 CRLF（检出时）

    `git config --global core.autocrlf true`

仅在 Windows 上转换，Linux/macOS 不转换

    `git config --global core.autocrlf input`

禁止自动转换（适合跨平台团队统一使用 LF）

    `git config --global core.autocrlf false`

## 同步上游仓库

添加原仓库为 upstream

    `git remote add upstream https://github.com/原作者/仓库名.git`

校验远程

    `git remote -v`

日常同步

```bash
git checkout main或master

```

```bash
# 拉取上游全部更新

git fetch upstream

# 切换到本地主分支（main/master 看项目）

git checkout main

# 合并上游最新代码到本地

git merge upstream/main

```

遇到冲突 改完冲突文件后执行

```bash
git add .
git commit -m "合并上游更新"
```
