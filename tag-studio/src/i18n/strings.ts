// Every screen string in Thai and English.
export type Lang = "th" | "en";

const S = {
  "common.cancel": ["ยกเลิก", "Cancel"],
  "home": ["เครื่องมือทั้งหมด", "Tools"],

  "design.name": ["ชื่อแบบ", "Design name"],
  "design.new": ["แบบใหม่", "New"],
  "design.newConfirm": ["เริ่มแบบใหม่? แบบปัจจุบันจะถูกล้าง (บันทึกก่อนถ้าต้องการ)", "Start a new Design? The current one is cleared (save it first if needed)."],
  "design.open": ["เปิดแบบ", "Open"],
  "design.openFailed": ["เปิดไฟล์แบบไม่ได้", "Could not open the Design"],
  "design.save": ["บันทึกแบบ", "Save"],
  "design.export": ["ส่งออก 3MF", "Export 3MF"],

  "card.picture": ["รูป", "Picture"],
  "card.name": ["ชื่อ", "Name"],
  "card.plate": ["แผ่นป้าย", "Plate"],
  "card.rings": ["ขอบสติกเกอร์", "Outline rings"],
  "card.colours": ["สี", "Colours"],
  "card.loop": ["ห่วงพวงกุญแจ", "Keyring loop"],

  "picture.upload": ["อัปรูป", "Upload a picture"],
  "picture.change": ["เปลี่ยนรูป", "Change picture"],
  "picture.remove": ["เอารูปออก", "Remove picture"],
  "picture.hint": ["PNG พื้นใส หรือรูปการ์ตูนพื้นเรียบได้ผลดีสุด ไม่ใส่รูปก็ได้ จะเป็นป้ายชื่ออย่างเดียว", "A transparent PNG or a cartoon on a plain background works best. Leave it out for a name-only tag."],
  "picture.crop": ["ครอป / หมุน / ปรับแสงรูป", "Crop / rotate / adjust"],
  "picture.removeBg": ["ลบพื้นหลัง", "Remove background"],
  "picture.removeBgHint": ["เปิด = ทรงตามตัวรูป · ปิด = ใช้ทั้งรูปเป็นสี่เหลี่ยม", "On: shaped like the subject · Off: the whole picture as a rectangle"],
  "picture.holes": ["เจาะช่องว่างด้านใน", "Punch enclosed gaps"],
  "picture.holesHint": ["เปิด = ช่องสีพื้นที่ถูกล้อม (ระหว่างแขน/ขา) ไม่นูน เห็นสีแผ่นป้าย · ปิด = เก็บไว้", "On: background-coloured gaps (between arms/legs) aren't raised, so the plate shows · Off: kept"],
  "picture.strength": ["ความแรงการตัดพื้นหลัง", "Background removal strength"],
  "picture.colours": ["แยกสีจากรูป", "Colours from the picture"],
  "picture.coloursHint": ["แต่ละสีพิมพ์เป็นเส้นพลาสติกคนละสี", "Each colour prints as its own filament"],
  "picture.colourN": ["สีที่", "Colour"],
  "picture.fromImage": ["สีจากรูป", "Colour in the picture"],
  "heights.title": ["ความสูงแต่ละชั้น", "Layer heights"],
  "heights.hint": ["แต่ละสีของรูปสูงไม่เท่ากันได้ · 0 = ฝังเรียบ · เกิน 4 มม. ส่วนที่บางอาจหัก · ชื่อและวงขอบใช้ความสูงลายนูน", "Each picture colour can stand at its own height · 0 = flush · above 4 mm, thin parts can snap · the name and rings keep the Raised height"],
  "heights.pickHint": ["คลิกชิ้นในภาพ 3D เพื่อยกสูงเฉพาะชิ้นนั้น · Shift+คลิก เลือกหลายชิ้น", "Click a patch in the 3D preview to raise it on its own · Shift-click to pick more"],
  "heights.pickTag": ["สลับไปดู “ป้ายนี้” เพื่อคลิกเลือกชิ้น", "Switch to “This tag” to click patches"],
  "heights.selected": ["ชิ้นที่เลือก", "Selected patches"],
  "heights.resetSel": ["กลับไปใช้ความสูงของสี", "Reset to colour"],
  "heights.deselect": ["ยกเลิกการเลือก", "Deselect"],
  "heights.own": ["ชิ้นตั้งความสูงเอง", "set on their own"],
  "heights.reset": ["คืนค่า", "Reset"],
  "heights.pop": ["ทำให้ลอยเด่น", "Make it pop"],
  "heights.flatten": ["ทำให้เรียบเท่ากัน", "Flatten"],
  "picture.width": ["ความกว้างรูป", "Picture width"],

  "ai.title": ["✨ แปลงรูปเป็นการ์ตูนด้วย AI", "✨ AI cartoon"],
  "ai.hint": ["เส้นดำ สีเรียบ ไม่มีเงา แยกสีได้สวยกว่ารูปถ่าย · ส่งรูปไป OpenRouter เมื่อกดปุ่มเท่านั้น", "Black outlines, flat colours, no shading; splits far better than a photo. The picture goes to OpenRouter only when you press the button."],
  "ai.make": ["แปลงเป็นการ์ตูน", "Make a cartoon"],
  "ai.again": ["ทำใหม่อีกครั้ง", "Try again"],
  "ai.working": ["กำลังวาด… (10–30 วินาที)", "Drawing… (10–30 s)"],
  "ai.failed": ["แปลงไม่สำเร็จ", "Cartoon failed"],
  "ai.use": ["ใช้รูปการ์ตูน", "Use the cartoon"],
  "ai.disabled": ["ยังไม่ได้ตั้งค่า: ใส่ OPENROUTER_API_KEY ใน tag-studio/.env แล้วเริ่ม dev server ใหม่", "Not set up: add OPENROUTER_API_KEY to tag-studio/.env and restart the dev server"],

  "crop.title": ["✂️ ครอป / หมุน / ปรับแสงรูป", "✂️ Crop / rotate / adjust"],
  "crop.hint": ["ลากกรอบเพื่อครอป · ลากมุมเพื่อย่อขยาย · ปรับแสงให้สว่าง/สดขึ้นก่อนแยกสี", "Drag the frame to crop, its corners to resize. Brighten or saturate before the colour split."],
  "crop.left": ["หมุนซ้าย", "Rotate left"],
  "crop.right": ["หมุนขวา", "Rotate right"],
  "crop.whole": ["ใช้ทั้งรูป", "Whole picture"],
  "crop.fine": ["หมุนละเอียด", "Fine rotation"],
  "crop.brightness": ["ความสว่าง", "Brightness"],
  "crop.contrast": ["ความคมชัด", "Contrast"],
  "crop.saturation": ["ความสดของสี", "Saturation"],
  "crop.use": ["✅ ใช้รูปนี้", "✅ Use this picture"],

  "names.label": ["ชื่อ (บรรทัดละ 1 ชื่อ = 1 ป้าย)", "Names (one per line = one tag each)"],
  "names.hint": ["ใส่หลายชื่อได้ เช่น ทั้งห้องเรียน ทุกป้ายใช้รูปและสไตล์เดียวกัน · เว้นว่าง = ป้ายรูปอย่างเดียว", "Several names make a set, e.g. a whole class, all with the same picture and style. Empty = a picture-only tag."],
  "names.preview": ["ดูตัวอย่างป้าย", "Preview tag"],
  "names.count": ["ป้าย", "tags"],
  "font.label": ["ฟอนต์", "Font"],
  "font.hint": ["ตัวอักษรที่ฟอนต์ไม่มี ระบบใช้ฟอนต์ภาษานั้นให้เอง", "Characters the font lacks use a font for that script"],
  "font.latin": ["อังกฤษ", "English"],
  "font.thai": ["ไทย + อังกฤษ", "Thai + English"],
  "font.korean": ["เกาหลี", "Korean"],
  "font.chinese": ["จีน", "Chinese"],
  "name.size": ["ความสูงตัวอักษร", "Letter height"],
  "name.weight": ["ความหนาเส้น (1 = ตามฟอนต์)", "Stroke weight (1 = as drawn)"],
  "name.spacing": ["ระยะห่างตัวอักษร", "Letter spacing"],
  "name.position": ["ตำแหน่งชื่อ", "Name position"],
  "name.gap": ["ระยะห่างจากรูป", "Gap from the picture"],
  "pos.below": ["ใต้รูป", "Below"],
  "pos.above": ["เหนือรูป", "Above"],
  "pos.left": ["ซ้าย", "Left"],
  "pos.right": ["ขวา", "Right"],

  "plate.thickness": ["ความหนาแผ่น", "Plate thickness"],
  "plate.relief": ["ความสูงลายนูน", "Raised height"],
  "plate.border": ["ขอบรอบลาย", "Border"],
  "plate.fillHoles": ["เติมรูด้านใน", "Fill holes"],
  "plate.fillHolesHint": ["เปิด = แผ่นเต็มใต้ช่องในตัวอักษร (O, A) และในรูป", "On: the plate stays solid inside letters like O and A, and inside the picture"],

  "rings.count": ["จำนวนขอบ", "Rings"],
  "rings.hint": ["แถบสีรอบรูปและชื่อ แบบสติกเกอร์ · ขอบละ 1 สี", "Coloured bands around the artwork, sticker style. Each ring adds a colour."],
  "rings.none": ["ไม่มี", "None"],
  "rings.width": ["ความกว้างขอบ", "Ring width"],
  "rings.inner": ["สีขอบใน", "Inner ring"],
  "rings.outer": ["สีขอบนอก", "Outer ring"],

  "colour.plate": ["สีแผ่นป้าย", "Plate colour"],
  "colour.name": ["สีชื่อ", "Name colour"],
  "colour.pairs": ["คู่สีพร้อมใช้", "Colour pairs"],
  "colour.pairsHint": ["แตะ = แผ่นป้ายสีแรก ชื่อสีหลัง", "Tap: the plate takes the first colour, the name the second"],
  "colour.used": ["ใช้เส้นพลาสติก", "Filaments used:"],
  "colour.over4": ["เกิน 4 สี: AMS Lite ใส่ได้ 4 ม้วน ต้องเปลี่ยนม้วนเอง", "Over 4: the AMS Lite holds 4 spools, so some need a manual swap"],

  "loop.side": ["ตำแหน่งห่วง", "Loop side"],
  "loop.top": ["บน", "Top"],
  "loop.left": ["ซ้าย", "Left"],
  "loop.right": ["ขวา", "Right"],
  "loop.none": ["ไม่มีห่วง", "No loop"],
  "loop.offset": ["เลื่อนห่วงตามขอบ", "Slide along the edge"],
  "loop.hole": ["ขนาดรูห่วง", "Hole diameter"],
  "loop.wall": ["ความหนาขอบห่วง", "Loop wall"],

  "view.tag": ["ป้ายนี้", "This tag"],
  "view.plate": ["เพลทแรก", "Plate 1"],
  "view.reset": ["มุมมองเริ่มต้น", "Reset view"],
  "view.hint": ["ลากเมาส์ = หมุน · สกอลล์ = ซูม", "Drag to rotate · scroll to zoom"],
  "view.plateHint": ["ทุกชื่อจัดลงเพลท A1 ตามไฟล์ที่พิมพ์จริง มุมขวาบนเว้นไว้ให้ prime tower", "Every name laid out on A1 plates as exported; the top-right corner stays free for the prime tower"],

  "status.building": ["กำลังสร้างโมเดล…", "Building…"],
  "status.tracing": ["กำลังแยกสีจากรูป…", "Tracing the picture…"],
  "status.exporting": ["กำลังทำไฟล์ 3MF…", "Making the 3MF…"],
  "status.exported": ["ส่งออกแล้ว", "Exported"],
  "status.plates": ["เพลท", "plate(s)"],
  "status.filaments": ["สี", "filaments"],

  "warn.empty": ["ยังไม่มีรูปหรือชื่อ: อัปรูปหรือพิมพ์ชื่อ", "No picture or name yet: upload a picture or type a name"],
  "warn.apart": ["รูปกับชื่ออยู่ห่างกันมาก แผ่นป้ายเลยต่อกันเป็นทรงกว้าง ลองลดระยะห่าง", "The picture and name are far apart, so the plate was joined into a wide shape. Try a smaller gap."],
  "warn.tall": ["มีชิ้นสูงเกิน 4 มม.: ส่วนที่บางอาจหักหรือโยกตอนพิมพ์", "Some patches stand over 4 mm: thin ones can snap or wobble while printing."],
  "warn.over4": ["เกิน 4 สี: AMS Lite ใส่ได้ 4 ม้วน ต้องเปลี่ยนม้วนเอง", "Over 4 colours: the AMS Lite holds 4 spools, so some need a manual swap"],
} as const satisfies Record<string, readonly [string, string]>;

export type StringKey = keyof typeof S;

let lang: Lang = "th";

export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
}

/** Translates a string key, or returns other text unchanged (e.g. a worker message). */
export function tr(text: string): string {
  return text in S ? t(text as StringKey) : text;
}

export function t(key: StringKey): string {
  const s = (S as Record<string, readonly [string, string]>)[key];
  if (!s) {
    if (import.meta.env?.DEV) console.warn(`missing string ${key}`);
    return key;
  }
  return s[lang === "th" ? 0 : 1];
}
