import axios from "axios";
import { formatTime } from '../utils/other.js'
import puppeteer from "../../../lib/puppeteer/puppeteer.js";
import PickSongList from "../model/pick-song.js";
import { NETEASE_API_CN, NETEASE_SONG_DOWNLOAD, NETEASE_TEMP_API } from "../constants/tools.js";
import { COMMON_USER_AGENT, REDIS_YUNZAI_ISOVERSEA, REDIS_YUNZAI_SONGINFO } from "../constants/constant.js";
import {  } from "../utils/common.js";
import { redisExistKey, redisGetKey, redisSetKey } from "../utils/redis-util.js";
import { checkAndRemoveFile } from "../utils/file.js";
import config from "../model/config.js";

export class songRequest extends plugin {
    constructor() {
        super({
            name: "R插件点歌",
            dsc: "实现快捷点歌",
            priority: 300,
            rule: [
                {
                    reg: '^点歌|#?听[1-9][0-9]|#?听[0-9]*$',
                    fnc: 'pickSong'
                },
                {
                    reg: "^播放(.*)",
                    fnc: "playSong"
                },
            ]
        });
        this.toolsConfig = config.getConfig("tools");
        // 加载网易云Cookie
        this.neteaseCookie = this.toolsConfig.neteaseCookie
        // 加载是否自建服务器
        this.useLocalNeteaseAPI = this.toolsConfig.useLocalNeteaseAPI
        // 加载自建服务器API
        this.neteaseCloudAPIServer = this.toolsConfig.neteaseCloudAPIServer
        // 加载网易云解析最高音质
        this.neteaseCloudAudioQuality = this.toolsConfig.neteaseCloudAudioQuality
        // 加载识别前缀
        this.identifyPrefix = this.toolsConfig.identifyPrefix;
    }

    // 判断是否海外服务器
    async isOverseasServer() {
        // 如果第一次使用没有值就设置
        if (!(await redisExistKey(REDIS_YUNZAI_ISOVERSEA))) {
            await redisSetKey(REDIS_YUNZAI_ISOVERSEA, {
                os: false,
            })
            return true;
        }
        // 如果有就取出来
        return (await redisGetKey(REDIS_YUNZAI_ISOVERSEA)).os;
    }

     // 网易云音乐下载策略
     neteasePlay(pickSongUrl, songInfo, pickNumber = 0, isCkExpired){
        axios.get(pickSongUrl, {
            headers: {
                "User-Agent": COMMON_USER_AGENT,
                "Cookie": this.neteaseCookie
            },
        }).then(async resp => {
            // 国内解决方案，替换API后这里也需要修改

            // 英转中字典匹配
            const translationDict = {
                'standard': '标准',
                'higher': '较高',
                'exhigh': '极高',
                'lossless': '无损',
                'hires': 'Hi-Res',
                'jyeffect': '高清环绕声',
                'sky': '沉浸环绕声',
                'dolby': '杜比全景声',
                'jymaster': '超清母带'
            };

            // 英转中
            function translateToChinese(word) {
                return translationDict[word] || word;  // 如果找不到对应翻译，返回原词
            }

            // 字节转MB
            function bytesToMB(sizeInBytes) {
                const sizeInMB = sizeInBytes / (1024 * 1024);  // 1 MB = 1024 * 1024 bytes
                return sizeInMB.toFixed(2);  // 保留两位小数
            }
            logger.info('下载歌曲详情-----------', resp.data.data)
            let url = await resp.data.data?.[0]?.url || null;
            const AudioLevel = translateToChinese(resp.data.data?.[0]?.level)
            const AudioSize = bytesToMB(resp.data.data?.[0]?.size)
            // 获取歌曲信息
            let title = songInfo[pickNumber].songName + '-' + songInfo[pickNumber].singerName
            // 一般这个情况是VIP歌曲 (如果没有url或者是国内,公用接口暂时不可用，必须自建并且ck可用状态才能进行高质量解析)
            if (!isCkExpired || !this.useLocalNeteaseAPI || url == null) {
                url = await this.musicTempApi(e, title, "网易云音乐");
            } else {
                // 拥有ck，并且有效，直接进行解析
                let audioInfo = AudioLevel;
                if (AudioLevel == '杜比全景声') {
                    audioInfo += '\n(杜比下载文件为MP4，编码格式为AC-4，需要设备支持才可播放)';
                }
                e.reply([segment.image(songInfo[pickNumber].cover), `${this.identifyPrefix}识别：网易云音乐，${title}\n当前下载音质: ${audioInfo}\n预估大小: ${AudioSize}MB`]);
            }
            // 动态判断后缀名
            let musicExt = resp.data.data?.[0]?.type
            // 下载音乐
            downloadAudio(url, this.getCurDownloadPath(e), title, 'follow', musicExt).then(async path => {
                // 发送语音
                if (musicExt != 'mp4') {
                    await e.reply(segment.record(path));
                }
                // 上传群文件
                await this.uploadGroupFile(e, path);
                // 删除文件
                await checkAndRemoveFile(path);
            }).catch(err => {
                logger.error(`下载音乐失败，错误信息为: ${err}`);
            });
        });
    }

    async musicTempApi(e, title, musicType) {
        let musicReqApi = NETEASE_TEMP_API;
        // 临时接口，title经过变换后搜索到的音乐质量提升
        const vipMusicData = await axios.get(musicReqApi.replace("{}", title.replace("-", " ")), {
            headers: {
                "User-Agent": COMMON_USER_AGENT,
            },
        });
        const messageTitle = title + "\nR插件检测到当前为VIP音乐，正在转换...";
        // ??后的内容是适配`QQ_MUSIC_TEMP_API`、最后是汽水
        const url = vipMusicData.data?.music_url ?? vipMusicData.data?.data?.music_url ?? vipMusicData.data?.music;
        const cover = vipMusicData.data?.cover ?? vipMusicData.data?.data?.cover ?? vipMusicData.data?.cover;
        await e.reply([segment.image(cover), `${this.identifyPrefix}识别：${musicType}，${messageTitle}`]);
        return url;
    }

    async pickSong(e) {
        const isOversea = await this.isOverseasServer();
        let autoSelectNeteaseApi
        if (this.useLocalNeteaseAPI) {
            // 使用自建 API
            autoSelectNeteaseApi = this.neteaseCloudAPIServer
        } else {
            // 自动选择 API
            autoSelectNeteaseApi = isOversea ? NETEASE_SONG_DOWNLOAD : NETEASE_API_CN;
        }
        let songInfo = []
        // 获取搜索歌曲列表信息
        let searchUrl = autoSelectNeteaseApi + '/search?keywords={}&limit=10' //搜索API
        let detailUrl = autoSelectNeteaseApi + "/song/detail?ids={}" //歌曲详情API
        if (e.msg.replace(/\s+/g, "").match(/点歌(.+)/)) {
            const songKeyWord = e.msg.replace(/\s+/g, "").match(/点歌(.+)/)[1]
            searchUrl = searchUrl.replace("{}", songKeyWord)
            await axios.get(searchUrl, {
                headers: {
                    "User-Agent": COMMON_USER_AGENT
                },
            }).then(async res => {
                if (res.data.result.songs) {
                    for (const info of res.data.result.songs) {
                        songInfo.push({
                            'id': info.id,
                            'songName': info.name,
                            'singerName': info.artists[0]?.name,
                            'duration': formatTime(info.duration)
                        });
                    }
                    const ids = songInfo.map(item => item.id).join(',');
                    detailUrl = detailUrl.replace("{}", ids)
                    await axios.get(detailUrl, {
                        headers: {
                            "User-Agent": COMMON_USER_AGENT
                        },
                    }).then(res => {
                        for (let i = 0; i < res.data.songs.length; i++) {
                            songInfo[i].cover = res.data.songs[i].al.picUrl
                        }
                    })
                    await redisSetKey(REDIS_YUNZAI_SONGINFO, songInfo)
                    const data = await new PickSongList(e).getData(songInfo)
                    let img = await puppeteer.screenshot("pick-song", data);
                    e.reply(img, true);
                } else {
                    e.reply('暂未找到你想听的歌哦~')
                }
            })
        } else if (await redisGetKey(REDIS_YUNZAI_SONGINFO) != []) {
            if (e.msg.match(/听(\d+)/)) {
                const pickNumber = e.msg.match(/听(\d+)/)[1] - 1
                let songInfo = await redisGetKey(REDIS_YUNZAI_SONGINFO)
                const AUTO_NETEASE_SONG_DOWNLOAD = autoSelectNeteaseApi + "/song/url/v1?id={}&level=" + this.neteaseCloudAudioQuality;
                const pickSongUrl = AUTO_NETEASE_SONG_DOWNLOAD.replace("{}", songInfo[pickNumber].id)
                const statusUrl = autoSelectNeteaseApi + '/login/status' //用户状态API
                const isCkExpired = await axios.get(statusUrl, {
                    headers: {
                        "User-Agent": COMMON_USER_AGENT,
                        "Cookie": this.neteaseCookie
                    },
                }).then(res => {
                    const userInfo = res.data.data.profile
                    if (userInfo) {
                        logger.info('ck活着，使用ck进行高音质下载')
                        return true
                    } else {
                        logger.info('ck失效，将启用临时接口下载')
                        return false
                    }
                })
                // // 请求netease数据
                this.neteasePlay(pickSongUrl, songInfo, pickNumber, isCkExpired)
            }
        }

    }

   
    /**
  * 获取当前发送人/群的下载路径
  * @param e Yunzai 机器人事件
  * @returns {string}
  */
    getCurDownloadPath(e) {
        return `${this.defaultPath}${e.group_id || e.user_id}`
    }

    /**
     * 上传到群文件
     * @param e             交互事件
     * @param path          上传的文件所在路径
     * @return {Promise<void>}
     */
    async uploadGroupFile(e, path) {
        // 判断是否是ICQQ
        if (e.bot?.sendUni) {
            await e.group.fs.upload(path);
        } else {
            await e.group.sendFile(path);
        }
    }
}