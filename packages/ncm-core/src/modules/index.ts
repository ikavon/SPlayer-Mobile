/**
 * 模块绑定层：把每个 NeteaseModule 绑定到 createRequest，暴露成 (query) => Promise 的 API
 */
import { createRequest } from "../request";
import type { Query, RequestResponse } from "../types";
import searchHotDetail from "./search_hot_detail";
import searchSuggest from "./search_suggest";
import playlistDetail from "./playlist_detail";
import playlistTrackAll from "./playlist_track_all";
import cloudsearch from "./cloudsearch";
import lyricNew from "./lyric_new";
import loginQrKey from "./login_qr_key";
import loginQrCreate from "./login_qr_create";
import loginQrCheck from "./login_qr_check";
import loginStatus from "./login_status";
import loginRefresh from "./login_refresh";
import loginCellphone from "./login_cellphone";
import captchaSent from "./captcha_sent";
import logout from "./logout";
import recommendSongs from "./recommend_songs";
import personalized from "./personalized";
import songUrl from "./song_url";
import album from "./album";
import artists from "./artists";
import artistAlbum from "./artist_album";
import like from "./like";
import albumSub from "./album_sub";
import artistSub from "./artist_sub";
import playlistSubscribe from "./playlist_subscribe";
import playlistCreate from "./playlist_create";
import playlistTracks from "./playlist_tracks";
import playlistDelete from "./playlist_delete";
import playlistNameUpdate from "./playlist_name_update";
import userPlaylist from "./user_playlist";
import userAlbum from "./user_album";
import userArtist from "./user_artist";
import userLike from "./user_like";
import songDetail from "./song_detail";

type Mod = (q: Query, r: typeof createRequest) => Promise<RequestResponse>;
const bind = (m: Mod) => (q: Query = {}): Promise<RequestResponse> => m(q, createRequest);

export const api = {
  searchHotDetail: bind(searchHotDetail),
  searchSuggest: bind(searchSuggest),
  playlistDetail: bind(playlistDetail),
  playlistTrackAll: bind(playlistTrackAll),
  cloudsearch: bind(cloudsearch),
  lyricNew: bind(lyricNew),
  loginQrKey: bind(loginQrKey),
  loginQrCreate: bind(loginQrCreate),
  loginQrCheck: bind(loginQrCheck),
  loginStatus: bind(loginStatus),
  loginRefresh: bind(loginRefresh),
  loginCellphone: bind(loginCellphone),
  captchaSent: bind(captchaSent),
  logout: bind(logout),
  recommendSongs: bind(recommendSongs),
  personalized: bind(personalized),
  songUrl: bind(songUrl),
  album: bind(album),
  artists: bind(artists),
  artistAlbum: bind(artistAlbum),
  like: bind(like),
  albumSub: bind(albumSub),
  artistSub: bind(artistSub),
  playlistSubscribe: bind(playlistSubscribe),
  playlistCreate: bind(playlistCreate),
  playlistTracks: bind(playlistTracks),
  playlistDelete: bind(playlistDelete),
  playlistNameUpdate: bind(playlistNameUpdate),
  userPlaylist: bind(userPlaylist),
  userAlbum: bind(userAlbum),
  userArtist: bind(userArtist),
  userLike: bind(userLike),
  songDetail: bind(songDetail),
};
