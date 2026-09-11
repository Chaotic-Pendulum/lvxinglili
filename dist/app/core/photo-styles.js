// This module contains text only. Preview image paths belong exclusively to the UI module.
export const PACK_STYLE_ID = "pack-default";
export const PHOTO_STYLES = Object.freeze(
  [
    {
      id: "ink-wash",
      name: "水墨画",
      prompt:
        "中国传统水墨画，水墨浓淡层次，皴擦点染，宣纸渗化，适当留白，黑白灰为主、少量淡赭石。",
    },
    {
      id: "photorealism",
      name: "拟真摄影",
      prompt:
        "极致拟真摄影，自然可信的环境、角色和衣料细节，真实光学与空气透视，细腻动态范围，避免过度HDR。",
    },
    {
      id: "classical-oil",
      name: "古典油画",
      prompt:
        "欧洲古典油画，细腻罩染，丰富而克制的自然色调，严谨体积塑造，柔和明暗过渡，细微画布肌理。",
    },
    {
      id: "impressionism",
      name: "印象派",
      prompt:
        "法国印象派绘画，松动短笔触，光色交织，冷暖色并置，捕捉当下的光线变化，反光由色彩笔触构成。",
    },
    {
      id: "post-impressionism",
      name: "后印象派",
      prompt:
        "后印象派绘画，富有节奏的弯曲笔触，厚涂颜料，强烈蓝金互补色，主体与环境具有鲜明轮廓和情感表现。",
    },
    {
      id: "watercolor",
      name: "水彩画",
      prompt:
        "透明水彩画，湿画法晕染，清透叠色，柔和水痕与纸白，少量干笔刻画细节，冷压水彩纸纹理。",
    },
    {
      id: "gouache",
      name: "水粉画",
      prompt:
        "传统水粉插画，不透明哑光颜料，简练而准确的块面，层叠笔触，柔和粉质色彩，清晰剪影。",
    },
    {
      id: "ukiyo-e",
      name: "浮世绘",
      prompt:
        "江户浮世绘木版画，平面化色块，精练墨线，靛蓝与赭黄，木版套色纹理，程式化自然纹样。",
    },
    {
      id: "blue-green-shanshui",
      name: "青绿山水",
      prompt:
        "中国传统青绿山水，石青石绿矿物色，细致勾勒，层叠空间，绢本肌理，少许泥金点染，典雅工笔。",
    },
    {
      id: "graphite",
      name: "铅笔素描",
      prompt:
        "石墨铅笔素描，纯黑白灰，细腻排线和交叉排线，纸面颗粒，高光留白，以明暗塑造角色与景物。",
    },
    {
      id: "charcoal",
      name: "炭笔画",
      prompt:
        "表现力强的炭笔画，深黑炭粉与大面积擦染，粗犷手势笔触，橡皮提亮，戏剧性明暗，粗纹纸质感。",
    },
    {
      id: "etching",
      name: "钢笔蚀刻版画",
      prompt:
        "古典铜版蚀刻版画，精密钢笔般细线，密集交叉排线，单色黑墨与象牙白纸，雕刻般纹理和清晰远近层次。",
    },
    {
      id: "pastel",
      name: "粉彩画",
      prompt:
        "软粉彩画，粉末颗粒，柔和色彩叠擦，绒面纸肌理，暖金粉与冷蓝的柔和对比，朦胧但层次清楚。",
    },
    {
      id: "pointillism",
      name: "点彩派",
      prompt:
        "新印象派点彩画，以清晰可见的小纯色色点构成全部形体，互补色光学混合，细密耐心的点描，明亮宁静。",
    },
    {
      id: "fauvism",
      name: "野兽派",
      prompt:
        "野兽派绘画，大胆非自然色，朱红与钴蓝、橙黄与翠绿，粗放笔触，简化形体，饱满纯色和强烈情感。",
    },
    {
      id: "cubism",
      name: "立体主义",
      prompt:
        "立体主义绘画，以相互交错的几何平面分解主体与环境，多视角切面，明确棱角，赭石蓝绿调。",
    },
    {
      id: "art-nouveau",
      name: "新艺术运动",
      prompt:
        "新艺术运动插画，流动优雅的植物曲线，装饰性轮廓，平面自然色，精致自然纹饰，画面满幅无边框。",
    },
    {
      id: "art-deco",
      name: "装饰艺术",
      prompt:
        "装饰艺术绘画，几何化主体与环境，阶梯状形体，精确硬边，午夜蓝、青绿与金色，优雅简洁，不含文字。",
    },
    {
      id: "paper-cut",
      name: "剪纸拼贴",
      prompt:
        "手工多层彩纸剪纸，层叠纸张构成主体与环境，清晰切边，轻微纸层投影，可见纸纤维，精巧手工立体感。",
    },
    {
      id: "pixel-art",
      name: "像素艺术",
      prompt:
        "经典16位像素艺术，清晰方形像素，有限调色板，精心抖色，简洁块状造型与高光，无平滑渐变和模糊。",
    },
  ].map((style) => Object.freeze(style)),
);
export function normalizePhotoStyleId(id) {
  return PHOTO_STYLES.some((style) => style.id === id) ? id : PACK_STYLE_ID;
}
export function photoStyleSnapshot(pack, settings = {}) {
  const preset = PHOTO_STYLES.find(
    (style) => style.id === settings.photoStyleId,
  );
  return preset
    ? { ...preset }
    : {
        id: PACK_STYLE_ID,
        name: "素材包默认",
        prompt:
          pack.stylePrompt ||
          "Original gentle hand-painted picture-book illustration.",
      };
}
export function photoStyleInstructions(style) {
  if (style.id === PACK_STYLE_ID) return style.prompt;
  return `Selected visual style for the entire trip: ${style.name}. ${style.prompt}
Apply this medium consistently to BOTH the character and the environment. The character reference supplies identity, body and outfit design, not the rendering style. Translate colors as required by this medium while preserving recognizable outfit features. Do not add scenery, props, time of day or composition from a style example. The planned location and events remain fixed. This selected style takes priority over conflicting medium or rendering cues elsewhere.`;
}
