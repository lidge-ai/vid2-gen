# Authored timeline fields (v1)

The authoritative machine contract is [timeline.v1.json](../assets/timeline.v1.json). All objects are strict. Paths below are relative to `timeline.json`; built-in fonts are `sans`, `mono`, `serif`. This example intentionally exercises each branch; copy only the parts needed for a real project.

```json
{
  "version": 1,
  "output": {"width":1920,"height":1080,"fps":"30000/1001","background":"#111827","container":"mp4","videoCodec":"h264","quality":"high"},
  "beat": {"bpm":120,"offset":"0.1s","meter":4},
  "sources": {
    "hero":{"type":"image","path":"assets/hero.png"},
    "footage":{"type":"video","path":"assets/demo.mp4","muted":true},
    "music":{"type":"audio","path":"assets/music.wav"},
    "app":{"type":"capture","session":"demo.vid2cap"},
    "generated":{"type":"generate","provider":"ima2","kind":"image","prompt":"single product hero on neutral backdrop","options":{"size":"1920x1080"}},
    "ink":{"type":"color","color":"#243047"}
  },
  "fonts":{"display":{"path":"assets/display.ttf"},"ui":{"family":"Geist"}},
  "markers":{"reveal":"4s","outro":{"bar":9,"beat":1}},
  "scenes":[{
    "id":"open","duration":"5s","background":"ink","notes":"show the real product",
    "layers":[
      {"type":"media","source":"hero","fit":"blurfill","in":"0s","out":"5s","speed":1,"motion":"kenburns","opacity":1,"volume":0,"start":"0s","end":"5s","camera":[{"at":"0s","zoom":1,"x":0.5,"y":0.5,"ease":"out"},{"at":"5s","zoom":1.08,"x":0.52,"y":0.48,"ease":"inout"}],"window":{"x":180,"y":80,"width":1560,"height":880,"radius":18,"shadow":true,"border":true,"perspective":{"rx":0,"ry":0}},"cursor":{"style":"arrow","ripple":true,"scale":1}},
      {"type":"text","text":"Actual result","font":"display","weight":"black","size":96,"color":"#F5F5F2","x":120,"y":120,"align":"left","maxWidth":1200,"animation":"rise","animationDuration":"0.35s","box":{"color":"#141A26DD","padding":24},"shadow":{"color":"#00000099","blur":8,"y":3},"start":"0.3s","end":"4.6s"},
      {"type":"shape","shape":"rect","x":120,"y":880,"width":1400,"height":3,"color":"#F5F5F2","radius":0,"start":"0.3s","end":"4.8s"},
      {"type":"overlay","source":"hero","blend":"screen","opacity":0.15,"motion":"sweep","start":"3s","end":"4s"}
    ],
    "effects":[{"type":"grade","brightness":0,"contrast":1.05,"saturation":0.95,"temperature":6500},{"type":"grain","strength":2}],
    "transition":{"type":"fade","duration":"0.3s"}
  },{
    "id":"demo","duration":"6s","background":"#172235",
    "layers":[{"type":"media","source":"app","fit":"cover","in":{"event":"goto#1","offset":"0.2s"},"out":{"event":"save"},"speed":1,"camera":{"auto":"events","zoom":1.6,"hold":"0.8s"},"chroma":{"color":"#00FF00","similarity":0.2,"blend":0.05}}],
    "effects":[{"type":"flash","at":"1s","strength":0.5,"decay":12},{"type":"rgbsplit","at":"2s","frames":3,"px":8},{"type":"motionblur","frames":3},{"type":"vignette","strength":0.2}],
    "transition":{"type":"cut"}
  }],
  "overlays":[{"type":"overlay","source":"hero","blend":"normal","opacity":0.1,"motion":"none","start":"0s","end":"1s"}],
  "effects":[{"type":"grade","brightness":0,"contrast":1,"saturation":1}],
  "audio":{
    "music":{"source":"music","volume":0.7,"fadeOut":"1s"},
    "cues":[{"at":{"marker":"reveal","offset":"0s"},"sfx":"preset:impact","volume":0.8,"anchor":"start"}],
    "voice":[{"source":"music","at":"0s","volume":0.2}],
    "autoCues":false,"duckMusicUnderVoice":true,
    "loudness":{"target":-14,"truePeak":-1}
  },
  "qa":{"waive":[{"check":"frozen","from":"0s","to":"0.8s","reason":"intentional title hold"}]}
}
```

`$schema` may point to the packaged schema. `beat` may instead be `{ "map":"beats.json" }`. A marker may be a time literal or `{bar,beat}`. Text `x`/`y` may be `"center"`; `font` defaults to `sans`. `background` may be a hex color or source ID. Layers are composed in array order. `media.fit` is `cover|contain|blurfill`; `motion` is `none|kenburns|punch|drift`. A camera is either a key array or `{auto:"events",zoom,hold}` for capture. `cursor.style` is `arrow|dot|none`. Text `weight` is `regular|semibold|bold|black|italic`; `animation` is `none|fade|rise|slam|pop|type|wipe|blur`.

Transition names are the installed schema's `cut|fade|fadeblack|fadewhite|dissolve|slide*|wipe*|circleopen|circleclose|radial|smooth*|pixelize|zoomin|diag*|hlslice|hrslice|vuslice|vdslice|squeeze*|distance|hblur`; inspect `vid2 schema --json` for the exact enum. Effect branches are `grade`, `motionblur`, `vignette`, `grain`, `flash`, `rgbsplit`. Audio music can instead be `{"synth":{"preset":"launch","key":"Am","progression":["Am","F"],"sections":[{"at":"0s","energy":"intro"}]},"volume":0.7,"fadeOut":"1.5s"}` or `{"provider":"elevenlabs","prompt":"restrained pulse","volume":0.7,"fadeOut":"1s"}`. Voice can instead be `{"tts":{"provider":"elevenlabs","text":"See the result","voice":"voice-id","language":"en"},"at":"0s","volume":1}`. `qa.waive` accepts `format|duration|black|frozen|silence|loudness|av_sync|text_safe|contrast`; give a scoped range and a real reason, never a blanket waiver to hide an unknown defect.
