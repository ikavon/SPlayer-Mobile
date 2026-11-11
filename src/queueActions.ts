/**
 * 歌曲长按菜单：下一首播放 / 加到队尾；可选"从歌单移除"（自建歌单详情页提供）。
 * 供 Search、Detail 的歌曲行 onLongPress 调用。
 */
import { Alert } from 'react-native';
import { addToQueue, playNext } from './player';
import { useStore } from './store';
import { downloadSong, deleteDownload } from './download';
import type { NcmSong } from './ncm';

/** 直接设为下一首播放（无 Alert，带 toast）。供歌曲行 ⏭ 按钮调用 */
export async function playNextToast(song: NcmSong) {
  const playing = !!useStore.getState().current;
  const ok = await playNext(song);
  useStore.getState().showToast(ok ? (playing ? '已设为下一首' : '开始播放') : '加入失败（无可用音源）');
}

export function promptSongActions(
  song: NcmSong,
  opts?: { onRemoveFromPlaylist?: () => void },
) {
  type Action = { text: string; onPress?: () => void | Promise<void>; style?: 'destructive' | 'cancel' };
  const actions: Action[] = [
    {
      text: '下一首播放',
      onPress: async () => {
        const ok = await playNext(song);
        useStore.getState().showToast(ok ? '已设为下一首' : '加入失败（无可用音源）');
      },
    },
    {
      text: '加到队尾',
      onPress: async () => {
        const ok = await addToQueue(song);
        useStore.getState().showToast(ok ? '已加入队列' : '加入失败（无可用音源）');
      },
    },
    {
      text: useStore.getState().downloads[song.id] ? '删除下载' : '下载',
      onPress: async () => {
        if (useStore.getState().downloads[song.id]) {
          await deleteDownload(song.id);
          useStore.getState().showToast('已删除下载');
        } else {
          useStore.getState().showToast('下载中…');
          const ok = await downloadSong(song, useStore.getState().musicU);
          useStore.getState().showToast(ok ? '已下载' : '下载失败（无可用音源）');
        }
      },
    },
  ];
  if (opts?.onRemoveFromPlaylist) {
    actions.push({
      text: '从歌单移除',
      style: 'destructive',
      onPress: opts.onRemoveFromPlaylist,
    });
  }
  Alert.alert(song.name, '歌曲操作', [...actions, { text: '取消', style: 'cancel' }]);
}
