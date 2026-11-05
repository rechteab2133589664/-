# 院線 FIELD ENGINEER · 0.3 醫院現場與 Catalyst CLI 版

重新製作的電腦版醫院網管現場操作原型。以角色移動、現場設備、實體網孔與線路為核心；沒有沿用舊版經營介面或遊戲引擎。

## 開啟遊戲

解壓縮整個遊戲資料夾，用電腦瀏覽器開啟 `index.html`。HTML、CSS、JavaScript 與 SVG 都是本機檔案，不需安裝套件、登入或連網。

也可以在此工作區執行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace/-
```

建議桌面解析度 1366×768 以上。這是瀏覽器遊戲原型，不是 Windows 原生執行檔。

## 本次現場任務

1. 跟著畫面上方施工教學卡，按「帶我過去」走到 UPS 並開啟供電。機櫃 PDU 電源已預接。
2. 在配線架選天花板線槽、開始穿線，走到護理站插座完成降線。
3. 兩端分別完成 T568B 線序練習，再於牆面插座執行 1–8 基礎驗線。永久鏈路未驗線通過，Ping 不會成功。
4. 教學會逐條帶著接六段 Cat6 跳線，並標亮該點的網孔。
5. 用隨身 Console 線與筆電設定核心、接入設備的 VLAN、SVI、Trunk 與 Access VLAN，儲存設定。
6. 啟動工作站、設定靜態 IPv4，執行 `ping 10.10.10.1` 驗證。
7. 驗收後可拔除接線，觀察測試失敗，再練習復原。

### 操作

| 操作 | 按鍵／滑鼠 |
| --- | --- |
| 移動角色 | WASD 或方向鍵，方向對應螢幕；一般走速提高約 62% |
| 快跑 | 按住 Shift，速度再提高約 43% |
| 自動帶路 | 施工教學卡的「帶我過去」 |
| 重做埋線教學 | 右上角「埋線教學」，既有設備設定與跳線保留 |
| 自動走路 | 點地板，會繞過牆壁和設備 |
| 查看設備 | 走近後按 E，或點設備讓角色走過去 |
| 查看工具 | 1 |
| Cat6 網路線 | 2；點起點網孔，關面板、走到終點再點另一個網孔 |
| Console 線 | 3；點有供電設備的 Console 埠 |
| 拔線 | 4；點已接線的網孔 |
| 取消拉線／收起面板 | Esc |
| 操作手冊 | H |
| 縮放 | 滾輪或右上角 ＋／− |

有 8 條 Cat6 跳線；可選 3、10、30、90 m。不夠長不能接，已佔用網孔不能重複插，Console 管理埠不能接 Cat6。

角色、供電、纜線、設備組態與工作站設定會保存於目前瀏覽器的 `hospital.field-engineer.v1`。匯出存檔提供 JSON 備份；目前尚無匯入介面。重開現場需明確確認。

## 模擬範圍

本版實作：可碰撞的等角院區、角色移動、尋路、近距離互動、設備面板、網孔接線／拔線、長度檢查、供電、簡化 Console CLI、靜態 IPv4，以及由實際遊戲狀態決定成敗的閘道 Ping。

- 路由器與防火牆已有實驗室預設組態，本關不編輯其完整路由與政策。
- 新遊戲需完成配線架 P1 到牆面 J1 的線槽規劃、穿線、兩端 T568B 線序練習及 1–8 基礎驗線。P2–P4、J2 是未接通的備用孔。
- 舊版存檔保留已預埋鏈路；可按「埋線教學」重新練習，不會清除設備組態、IPv4 或現有跳線。
- 線序練習顯示邏輯針腳 1–8，不是 IDC 端子的實物佈局。真實資訊模組需依廠商色碼打線；簡單線序／導通測試不能取代 Cat6 認證測試。
- CLI 為原創的 Catalyst 風格子集合，不含 Cisco 韌體；不宣稱 99% 相容。實作模式權限、縮寫、Tab、`?`、VLAN／SVI／Access／Trunk、介面範圍、介面啟停、描述、hostname、`do show`、running／startup-config、互動存檔及 reload。
- 螢幕呈現訓練關卡用介面子集，並非實體機種所有埠數的複製。OSPF／BGP、ACL、完整 STP／DTP、AAA、SSH 等仍未實作；PortFast 只保存設定，不模擬 STP 狀態機。
- 工作站閘道驗收仍以本關 IPv4 目標為準。SVI up/down 取決於 VLAN 與有效介面；shutdown、Trunk allowed VLAN 與相關 native VLAN 設定會影響連線。
- 本地同 VLAN 工作站 Ping 閘道不依賴 ISP，也不要求先儲存設定；全工程任務另外要求完成全部配線與存檔。
- `copy run start` 需按 Enter 確認檔名；`write memory` 可直接儲存。`reload` 會詢問是否保存變更，UPS 重新供電會從 startup-config 還原。瀏覽器重新整理則保留目前遊戲現場，不等同設備重開機。
- 線長是場景距離估算；線槽施工目前為步驟模擬，沒有真實纜線物理、訊號衰減、完整封包或臨床應用模擬。
- 尚未加入萬人經營、監控平台、自動化部署；這些需在現場互動核心上繼續開發。
- 不連接任何真實設備，不處理真實病患資料。

## 驗證

在具備 Playwright 與 Chromium 的開發環境，先啟動本機 HTTP 服務，再執行：

```sh
node tests/field.smoke.cjs
node tests/tutorial.smoke.cjs
node tests/cisco-cli.test.cjs
node tests/cisco.browser.cjs
node tests/scene.smoke.cjs
```

測試用實際滑鼠與鍵盤操作施工教學、錯誤線槽／線序提示、穿線、兩端打線、基礎驗線、六段跳線、Console CLI 與工作站驗收，再拔線確認 Ping 失敗。另驗證走速與 Shift 快跑、舊存檔升級、未驗線不能 Ping，以及桌面版面。

受管理的測試瀏覽器封鎖 `file://` 導航，因此自動測試透過 HTTP；本機直接開啟的檔案路徑沒有伺服器 API 或跨檔案 fetch 依賴。

## 醫院場景

增加護理師、護理櫃台、病床與病患、床欄與床輪、床邊生命徵象螢幕、點滴架、隔簾、候診座椅、醫院導引標示與扶手。這些是等角視角的程式繪圖；目前不模擬臨床醫療行為。

### 0.3 醫院空間細化

增加有門口的診間／資訊室隔間、掛號批價櫃台、診療床、洗手台、耗材櫃、輪椅、候診叫號螢幕、床頭氧氣／呼叫／電源面板、窗戶、日光照明、樓層導引牌，以及巡走護理／工作人員與候診病患。隔間和家具參與碰撞；背景人員不阻擋玩家施工路線。場景仍是程式繪製的等角視角，並非照片或全 3D。

### CLI 入門範例

```text
SW-01> enable
SW-01# configure terminal
SW-01(config)# vlan 10
SW-01(config-vlan)# name NURSE
SW-01(config-vlan)# exit
SW-01(config)# interface gi0/1
SW-01(config-if)# switchport mode trunk
SW-01(config-if)# switchport trunk allowed vlan 10,20
SW-01(config-if)# end
SW-01# show interfaces trunk
SW-01# copy running-config startup-config
Destination filename [startup-config]?
[按 Enter]
```

輸入 `?` 查看目前模式可用指令，Tab 補全、Ctrl+Z 返回特權模式，↑／↓ 查歷史指令；可按「展開／收合終端機」放大。

測試另確認新診間與資訊室可經門口進入、核心設定完成後教學能轉往接入交換器，以及展開 Console 時命令列仍在可視範圍。
