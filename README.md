<p align="center">
  <a href="https://gitee.com/kyrzy0416/rconsole-plugin">
    <img width="200" src="./img/logo.png">
  </a>
</p>

<div align="center">
    <h1>R-plugin</h1>
    个人团队用的<a href="https://gitee.com/Le-niao/Yunzai-Bot" target="_blank">Yunzai-Bot</a>插件，插件的各种业务来源于周围人
<img src="https://cdn.jsdelivr.net/gh/xianxincoder/xianxincoder/assets/github-contribution-grid-snake.svg">
</div>

## 🗃️文件架构
apps -- 业务核心

config -- 配置文件

model -- 核心文件[建议不动]

resource -- 资源文件

test -- 爬虫文件[python]

index -- 主入口

## 📔使用说明
1. `test -- main.py`爬取链接
> python3 main.py
2. 下载mongodb
> linux系统下自己装一个mongodb，上一个密码(不上有风险)
3. 在`Yunzai-Bot`安装mongodb依赖
> pnpm add mongodb -w

> pnpm add axios -w
4. 下载插件
> git clone https://gitee.com/kyrzy0416/rconsole-plugin.git ./plugins/rconsole-plugin/

> 注：可以不用mongodb这些操作，只是用不了一些命令而已

## 📦业务
![help](./img/help.jpg)

## 🤳版本
![help](./img/version.jpg)

## 开发团队
| Nickname                                                     | Contribution |
| :----------------------------------------------------------: |--------------|
|[易曦翰](https://gitee.com/yixihan) | 后端开发         |
|[zhiyu](https://gitee.com/kyrzy0416) | 后端开发         |
|[Diviner](https://gitee.com/divinerJJ) | 前端开发         |

## 🚀后记
* 文件借鉴了很多插件，精简个人认为可以精简的内容。 
* 素材来源于网络，仅供交流学习使用 
* 严禁用于任何商业用途和非法行为 
* 如果对你有帮助辛苦给个star，这是对我最大的鼓励