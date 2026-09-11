const codes =
  `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW PS`.split(
    " ",
  );
const names = new Intl.DisplayNames(["zh-CN"], { type: "region" });
export const COUNTRIES = codes
  .map((id) => ({ id, name: names.of(id) }))
  .sort((a, b) =>
    a.id === "CN"
      ? -1
      : b.id === "CN"
        ? 1
        : a.name.localeCompare(b.name, "zh-CN"),
  );
export const PROVINCES = [
  ["CN-11", "北京"],
  ["CN-12", "天津"],
  ["CN-13", "河北"],
  ["CN-14", "山西"],
  ["CN-15", "内蒙古"],
  ["CN-21", "辽宁"],
  ["CN-22", "吉林"],
  ["CN-23", "黑龙江"],
  ["CN-31", "上海"],
  ["CN-32", "江苏"],
  ["CN-33", "浙江"],
  ["CN-34", "安徽"],
  ["CN-35", "福建"],
  ["CN-36", "江西"],
  ["CN-37", "山东"],
  ["CN-41", "河南"],
  ["CN-42", "湖北"],
  ["CN-43", "湖南"],
  ["CN-44", "广东"],
  ["CN-45", "广西"],
  ["CN-46", "海南"],
  ["CN-50", "重庆"],
  ["CN-51", "四川"],
  ["CN-52", "贵州"],
  ["CN-53", "云南"],
  ["CN-54", "西藏"],
  ["CN-61", "陕西"],
  ["CN-62", "甘肃"],
  ["CN-63", "青海"],
  ["CN-64", "宁夏"],
  ["CN-65", "新疆"],
  ["CN-71", "台湾"],
  ["CN-81", "香港"],
  ["CN-82", "澳门"],
].map(([id, name]) => ({ id, name, countryId: "CN" }));
export const DESTINATIONS = [
  ...PROVINCES,
  ...COUNTRIES.filter((c) => c.id !== "CN").map((c) => ({
    ...c,
    countryId: c.id,
  })),
];
export const destinationById = (id) => DESTINATIONS.find((x) => x.id === id);
export const destinationName = (id) =>
  destinationById(id)?.name || "未知目的地";
export const countryName = (id) =>
  COUNTRIES.find((x) => x.id === id)?.name || id;
export const localRecommendations = {
  "CN-65": ["mountain", "lake", "camp"],
  "CN-53": ["forest", "flower", "tea"],
  "CN-51": ["mountain", "forest", "rain"],
  "CN-46": ["sea", "sun", "picnic"],
  "CN-33": ["tea", "rain", "garden"],
  "CN-63": ["lake", "star", "mountain"],
  "CN-23": ["snow", "forest"],
  "CN-71": ["sea", "tea", "mountain"],
  "CN-54": ["mountain", "star"],
  NZ: ["mountain", "lake", "camp"],
  NO: ["snow", "sea"],
  CH: ["mountain", "lake"],
  JP: ["tea", "garden"],
  IS: ["snow", "star"],
  IT: ["picnic", "garden"],
  FR: ["picnic", "flower"],
  TH: ["sea", "sun"],
  CA: ["forest", "camp"],
  FI: ["forest", "snow"],
  KE: ["sun", "camp"],
  AU: ["sea", "star"],
};
