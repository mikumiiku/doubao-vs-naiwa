export const EGG_PORTRAITS = ['greeting', 'teaching', 'ready'] as const;
export const EGG_STORY = [
  {
    portrait: 'greeting',
    title: '奶蛋来敲门',
    line: '这次要守满三分钟。奶蛋按连段滚过来，越往后越快，中间有两段喘口气的时间。',
    cue: '豆包把围巾一甩，站到你身旁。',
  },
  {
    portrait: 'teaching',
    title: '等它进第三列',
    line: '从左往右数，一、二、三。看到金色框了吗？只有奶蛋中心进了第三列，才能点碎它。',
    cue: '草坪的第三列亮起一道金色边线。',
  },
  {
    portrait: 'teaching',
    title: '圈合上，点中心',
    line: '盯住蛋上的小圆圈，外圈收拢时点中心。鼠标点，或瞄准后交替按Z、X；按住不算连打。',
    cue: '豆包抬起手指，示意你盯住弹跳的奶蛋。',
  },
  {
    portrait: 'ready',
    title: '连击别断！',
    line: '判定只有一眨眼，后面还要上下跳着瞄准。漏掉五只就输了——最不饶弯的话：手跟上，开打！',
    cue: '豆包冲你眨眨眼，握紧了拳头。',
  },
] as const;
