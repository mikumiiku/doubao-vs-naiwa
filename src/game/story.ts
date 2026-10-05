import type { LevelDef } from './config';
import { EGG_STORY, type EGG_PORTRAITS } from './eggstory';

export interface StoryPage {
  portrait: (typeof EGG_PORTRAITS)[number];
  title: string;
  line: string;
  cue: string;
}

/** 所有关卡共用豆包对话；第五关保留完整的节奏教学。 */
export function battleStory(level: LevelDef): readonly StoryPage[] {
  if (level.kind === 'egg-invasion') return EGG_STORY;
  if (level.id === 1) return [
    { portrait: 'greeting', title: '先守住这一条草坪', line: '来啦！草刚长出来，今天先守中间这一行。奶蛙从右边来，我们把豆包种在左边。', cue: '豆包蹲下来，拍了拍新长出的草。' },
    { portrait: 'teaching', title: '接面团，种豆包', line: '飞来的面团记得点一下。攒够100，点上面的豆馅射手，再点草坪后排。它会替你拦住这一行的奶蛙。', cue: '豆包指了指卡牌，又向草坪左侧比画了一下。' },
    { portrait: 'ready', title: '第一口豆馅，安排！', line: '不用急，先把面团接住。最一针见血的话：后排站稳，前面交给豆馅！', cue: '豆包朝你眨眨眼，退到一旁。' },
  ];
  if (level.id === 2) return [
    { portrait: 'greeting', title: '草坪长到三行啦', line: '上下两条也长出来了！今天要照顾中间三行，奶蛙走哪行，就给哪行安排火力。', cue: '豆包伸出三根手指，望向新长出的草坪。' },
    { portrait: 'teaching', title: '先和面，再开火', line: '新来的和面豆包会做面团，先放在后排。接好面团，再种豆馅射手；三行都得有人守，可别只顾中间！', cue: '豆包揉起一小团面，举给你看。' },
    { portrait: 'ready', title: '饭管够，豆馅跟上', line: '后排管饭，前排管打。有面团就补火力，奶蛙再多也不让它进门。开工！', cue: '豆包把围巾系紧，给你让出位置。' },
  ];
  return [
    { portrait: 'teaching', title: level.name, line: level.intro ?? '奶蛙已经在路上了。接好面团，给每一行安排豆包！', cue: level.kind === 'conveyor' ? '豆包拉开门，木头传送带缓缓转动。' : '豆包凑过来，向你介绍这次的对手。' },
    { portrait: 'ready', title: '准备好了吗？', line: level.kind === 'conveyor' ? '卡牌送来就能种，选一张，再点草坪。面团这回不用攒，空着的行先照顾好！' : '先把后排安排好，再盯住靠近的奶蛙。我在旁边陪你，开打！', cue: '豆包握了握拳，冲你点头。' },
  ];
}
