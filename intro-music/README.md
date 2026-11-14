# intro-music

紹介動画用のBGM（依頼者がacemusicで生成した曲）と、その解析結果。この動画の制作だけに使う。

- `song.wav` … 曲（44.1kHz・ステレオ・89.11秒）。使うときは、48kHzに変換してよい
- `analysis.json` … 解析結果（テンポ約121.7 BPM、ハ長調、区切りの時刻、音量、30fpsのエネルギー）
  - 区切りの時刻は推定（誤差±0.3秒）。実際の音の立ち上がりを測って合わせること
  - 全拍にキックがある4つ打ちなので、小節の頭は音だけでは決まらない

取得: `git clone --depth 1 --branch assets/intro-music https://github.com/skyvesmir/vocaforge.git intro-music-src`
