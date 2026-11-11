/** 根栈：Main(双标签) + 推入式子页 + 模态 */
export type RootStackParamList = {
  Main: undefined;
  Player: undefined;
  Queue: undefined;
  Login: undefined;
  /** 官方网页登录（WebView 抓 cookie） */
  WebLogin: undefined;
  LikedSongs: undefined;
  History: undefined;
  Ranking: undefined;
  Downloads: undefined;
  Settings: undefined;
  Playlists: undefined;
  Albums: undefined;
  Artists: undefined;
  /** 添加到歌单：选自建歌单或新建后加入 */
  AddToPlaylist: { songId: number; songName: string };
  /** 共享详情页：歌单/专辑/歌手 */
  Detail: {
    source: 'playlist' | 'album' | 'artist';
    id: number;
    name?: string;
    cover?: string;
    subtitle?: string;
  };
};

/** 底部双标签：搜索 / 我的 */
export type TabsParamList = {
  Search: undefined;
  Library: undefined;
};