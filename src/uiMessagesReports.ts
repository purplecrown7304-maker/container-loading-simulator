/** Source-level report presentation translations; cargo identities and calculations remain unchanged. */
export const uiMessagesReports: Record<string, readonly [string, string]> = {
  "적재 제약 실패": [
    "Loading constraints failed",
    "Không đạt ràng buộc xếp hàng"
  ],
  "확인 필요": [
    "Verification required",
    "Cần kiểm tra"
  ],
  "트럭": [
    "Truck",
    "Xe tải"
  ],
  "컨테이너": [
    "Container",
    "Container"
  ],
  "{0} 통합 출하·적재 작업지시서": [
    "{0} shipment and loading work order",
    "Lệnh xuất và xếp hàng {0}"
  ],
  "바닥 +{0} mm · 단별 평면 배치": [
    "Floor +{0} mm · Layer plan",
    "Sàn +{0} mm · Sơ đồ từng tầng"
  ],
  "{0} {1} 구역 · {2} ~ {3} m": [
    "{0} Zone {1} · {2} ~ {3} m",
    "{0} Khu {1} · {2} ~ {3} m"
  ],
  "{0}개 · {1}단 · 높이 {2} mm": [
    "{0} units · {1} layers · Height {2} mm",
    "{0} kiện · {1} tầng · Cao {2} mm"
  ],
  "계획 적용": [
    "Included in plan",
    "Áp dụng trong kế hoạch"
  ],
  "범위 밖 · 미확정": [
    "Out of scope · Unconfirmed",
    "Ngoài phạm vi · Chưa xác nhận"
  ],
  "메움재 상세": [
    "Void-fill details",
    "Chi tiết vật liệu chèn"
  ],
  "총 {0} EA · {1} kg": [
    "Total {0} EA · {1} kg",
    "Tổng {0} EA · {1} kg"
  ],
  "유형": [
    "Type",
    "Loại"
  ],
  "자재": [
    "Material",
    "Vật liệu"
  ],
  "수량": [
    "Quantity",
    "Số lượng"
  ],
  "중량": [
    "Weight",
    "Khối lượng"
  ],
  "위치 X/Y/Z": [
    "Position X/Y/Z",
    "Vị trí X/Y/Z"
  ],
  "크기 L/W/H": [
    "Size L/W/H",
    "Kích thước D/R/C"
  ],
  "적용": [
    "Application",
    "Áp dụng"
  ],
  "미끄럼방지재": [
    "Anti-slip material",
    "Vật liệu chống trượt"
  ],
  "블로킹재": [
    "Blocking materials",
    "Vật tư chèn"
  ],
  "고정바": [
    "Load bars",
    "Thanh cố định"
  ],
  "밴딩": [
    "Strapping",
    "Đai buộc"
  ],
  "{0} 줄 / {1} m": [
    "{0} straps / {1} m",
    "{0} dây / {1} m"
  ],
  "각대": [
    "Corner protectors",
    "Nẹp góc"
  ],
  "랩핑": [
    "Wrapping",
    "Quấn màng"
  ],
  "□ 설치 확인": [
    "□ Verify installation",
    "□ Kiểm tra lắp đặt"
  ],
  "없음": [
    "None",
    "Không có"
  ],
  "미확인": [
    "Unverified",
    "Chưa xác minh"
  ],
  "기본 적재안": [
    "Base load plan",
    "Phương án xếp gốc"
  ],
  "보강 계획을 확인하세요": [
    "Check the reinforcement plan",
    "Kiểm tra kế hoạch gia cố"
  ],
  "추가 보강재": [
    "Additional reinforcement",
    "Vật liệu gia cố bổ sung"
  ],
  "적재 제약 위반이 있어 출고할 수 없습니다. 이 문서는 검토용입니다.": [
    "Dispatch is prohibited due to loading constraint violations. This document is for review only.",
    "Không được xuất hàng do vi phạm ràng buộc xếp hàng. Tài liệu này chỉ dùng để xem xét."
  ],
  "관성 3종 검증을 완료하고 위험 여부를 확인한 뒤 작업을 진행하세요.": [
    "Complete all three inertia checks and review hazards before starting work.",
    "Hoàn tất cả ba kiểm tra quán tính và xem xét nguy hiểm trước khi làm việc."
  ],
  "위험 기준을 초과했습니다. 출고 전 재배치·고정 보강 후 책임자의 확인을 받으세요.": [
    "Danger thresholds exceeded. Rearrange and reinforce securing, then obtain supervisor verification before dispatch.",
    "Đã vượt ngưỡng nguy hiểm. Sắp xếp lại và gia cố cố định, sau đó được người phụ trách kiểm tra trước khi xuất hàng."
  ],
  "출발·제동·회전 검증을 완료하고 미확인 항목을 책임자와 점검하세요.": [
    "Complete acceleration, braking and cornering checks, and review unverified items with the supervisor.",
    "Hoàn tất kiểm tra tăng tốc, phanh và vào cua, đồng thời kiểm tra các mục chưa xác nhận với người phụ trách."
  ],
  "설치 영역 안내에 따라 미끄럼방지재·블로킹·고정바를 대조하고 흔들림을 확인하세요.": [
    "Check anti-slip materials, blocking and load bars against the installation guide, and check for movement.",
    "Đối chiếu vật liệu chống trượt, chèn chặn và thanh chặn với hướng dẫn lắp đặt, rồi kiểm tra độ rung lắc."
  ],
  "잔량박스의 구역·높이와 출하 수량을 맞추고, 상단 빈 칸·측벽·끝단 유격을 보강하세요.": [
    "Match partial-carton zones, heights and shipment quantities; reinforce gaps at the top, side walls and end.",
    "Đối chiếu khu vực, độ cao của thùng lẻ và số lượng xuất hàng; gia cố khoảng trống phía trên, sát vách và cuối hàng."
  ],
  "포장 강도·장비 제원·결박장치 정격과 문 닫힘 간섭을 확인하고 담당자가 서명하세요.": [
    "Check packaging strength, equipment specifications, securing ratings and door clearance; have the responsible person sign.",
    "Kiểm tra độ bền bao bì, thông số thiết bị, định mức dây buộc và khoảng hở đóng cửa; người phụ trách ký xác nhận."
  ],
  "□ 장비 끝단·결박점 간섭 없음": [
    "□ No interference at equipment ends or securing points",
    "□ Không vướng ở đầu thiết bị hoặc điểm buộc"
  ],
  "□ 도어/상부 개방부 간섭 없음": [
    "□ No interference at doors or top opening",
    "□ Không vướng cửa hoặc phần mở phía trên"
  ],
  "□ 도어 닫힘 간섭 없음": [
    "□ No interference when closing doors",
    "□ Không vướng khi đóng cửa"
  ],
  "{0} · 출하지시 수량과 실제 적재 결과를 대조하는 현장 작업용 문서": [
    "{0} · Field work document for comparing shipment instructions with actual loading",
    "{0} · Tài liệu hiện trường để đối chiếu số lượng xuất hàng với kết quả xếp thực tế"
  ],
  "WHAT-IF REVIEW · 출고 승인 아님 · ": [
    "WHAT-IF REVIEW · Not dispatch approval · ",
    "WHAT-IF REVIEW · Không phải phê duyệt xuất hàng · "
  ],
  " · 위험": [
    " · Danger",
    " · Nguy hiểm"
  ],
  " · 검증 미완료": [
    " · Verification incomplete",
    " · Chưa hoàn tất kiểm tra"
  ],
  "{0}출고 전 확인 {1}건{2}": [
    "{0}{1} pre-dispatch checks{2}",
    "{0}{1} mục kiểm tra trước xuất hàng{2}"
  ],
  "WHAT-IF REVIEW · 출고 승인 아님": [
    "WHAT-IF REVIEW · Not dispatch approval",
    "WHAT-IF REVIEW · Không phải phê duyệt xuất hàng"
  ],
  "검토용 · 검증 확인 필요": [
    "For review · Verification required",
    "Để xem xét · Cần kiểm tra xác nhận"
  ],
  "운송 장비": [
    "Transport equipment",
    "Thiết bị vận chuyển"
  ],
  "실제 적재단위": [
    "Actual loaded units",
    "Đơn vị hàng đã xếp thực tế"
  ],
  "화물 중량": [
    "Cargo weight",
    "Khối lượng hàng"
  ],
  "미적재 · 별도 확인": [
    "Unloaded · Review separately",
    "Chưa xếp · Kiểm tra riêng"
  ],
  "적재 요약": [
    "Loading summary",
    "Tóm tắt xếp hàng"
  ],
  "한눈에 보는 적재 배치": [
    "Loading layout at a glance",
    "Tổng quan bố trí xếp hàng"
  ],
  "안쪽부터 구역 번호순으로, 한 구역 안에서는 바닥부터 위로 쌓으세요. 위치는 안쪽 벽 기준입니다.": [
    "Work from the inner end in zone-number order; stack each zone from the floor upward. Positions are measured from the inner wall.",
    "Xếp từ phía trong theo thứ tự số khu; trong mỗi khu, xếp từ sàn lên trên. Vị trí được đo từ vách trong."
  ],
  "구역별 작업 순서": [
    "Work sequence by zone",
    "Trình tự làm việc theo khu"
  ],
  "길이×폭은 놓은 상태의 방향입니다. 도면의 위·아래는 위에서 본 좌·우 벽이며, 서로 다른 바닥 높이는 별도 단으로 표시합니다.": [
    "Length × width follows the placed orientation. The top and bottom of the plan represent the side walls; different base elevations are shown as separate layers.",
    "Dài × rộng theo hướng đặt thực tế. Phía trên và dưới sơ đồ là hai vách bên khi nhìn từ trên; các cao độ đáy khác nhau được thể hiện thành tầng riêng."
  ],
  "3D 완료 모습과 구역별 진행": [
    "Completed 3D view and zone progress",
    "Hình 3D hoàn chỉnh và tiến độ theo khu"
  ],
  "회색은 이미 쌓은 구역, 품목 색은 이번 구역입니다. 빈 공간과 빨간 테두리 잔량박스를 대조하세요.": [
    "Gray shows completed zones; item colors show the current zone. Check voids and red-bordered partial cartons.",
    "Màu xám là khu đã xếp; màu mặt hàng là khu hiện tại. Kiểm tra khoảng trống và thùng lẻ viền đỏ."
  ],
  "단별 배치 상세": [
    "Layer layout details",
    "Chi tiết bố trí từng tầng"
  ],
  "구역별 작업표의 바닥 높이와 맞춰 확인하세요. 각 단의 서로 다른 품목 위치와 빈 칸을 표시합니다.": [
    "Match base elevations to the zone work table. Each layer shows item positions and empty spaces.",
    "Đối chiếu cao độ đáy với bảng công việc theo khu. Mỗi tầng thể hiện vị trí mặt hàng và khoảng trống."
  ],
  "출하 수량과 보조자재": [
    "Shipment quantities and securing materials",
    "Số lượng xuất hàng và vật liệu hỗ trợ"
  ],
  "품목별 수량과 준비 자재를 대조하고 설치 대상 영역을 확인하세요.": [
    "Check item quantities and prepared materials, then verify installation areas.",
    "Đối chiếu số lượng từng mặt hàng và vật liệu chuẩn bị, rồi kiểm tra khu vực lắp đặt."
  ],
  "보조 고정 미확인": [
    "Supplementary securing unverified",
    "Chưa kiểm tra cố định bổ sung"
  ],
  "필요 보조자재": [
    "Required securing materials",
    "Vật liệu cố định cần thiết"
  ],
  "현장 작업 체크리스트": [
    "Field work checklist",
    "Danh sách kiểm tra hiện trường"
  ],
  "계산으로 확인할 수 없는 현장 항목입니다. 작업자가 직접 확인하고 표시하세요.": [
    "These field conditions cannot be verified by calculation. Workers must check and mark them personally.",
    "Đây là các điều kiện hiện trường không thể xác nhận bằng tính toán. Người thao tác phải trực tiếp kiểm tra và đánh dấu."
  ],
  "출고 전 최종 확인": [
    "Final checks before dispatch",
    "Kiểm tra cuối trước khi xuất hàng"
  ],
  "아래 3개 작업을 확인한 뒤 담당자가 서명하세요.": [
    "Verify the three tasks below, then have the responsible person sign.",
    "Kiểm tra ba công việc dưới đây, sau đó người phụ trách ký xác nhận."
  ],
  "□ 흔들림/빈 공간 보강 확인": [
    "□ Check movement and void reinforcement",
    "□ Kiểm tra rung lắc và gia cố khoảng trống"
  ],
  "□ 출하지시 수량과 실물 수량 일치": [
    "□ Shipment instructions match actual quantities",
    "□ Số lượng thực tế khớp lệnh xuất hàng"
  ],
  "검증 판정: {0}": [
    "Verification verdict: {0}",
    "Kết luận kiểm tra: {0}"
  ],
  "관성 판정은 시뮬레이터 내부 비교 결과이며 실제 운송 안전 인증을 의미하지 않습니다. ‘주의 · 검토용’은 내부 PASS 기준 일부 초과·위험 기준 이내인 결과이며 출고 승인을 의미하지 않습니다. 장비 기준: {0}.": [
    "The inertia verdict is an internal simulator comparison, not transport safety certification. “Caution · For review” means some internal PASS limits are exceeded while remaining within danger thresholds; it is not dispatch approval. Equipment reference: {0}.",
    "Kết luận quán tính là so sánh nội bộ của mô phỏng, không phải chứng nhận an toàn vận chuyển. “Thận trọng · Để xem xét” nghĩa là vượt một số giới hạn PASS nội bộ nhưng vẫn trong ngưỡng nguy hiểm; đây không phải phê duyệt xuất hàng. Căn cứ thiết bị: {0}."
  ],
  "완료 · PASS": [
    "Complete · PASS",
    "Hoàn tất · PASS"
  ],
  "검사 완료 · 미통과": [
    "Inspection complete · Not passed",
    "Đã kiểm tra · Không đạt"
  ],
  "미완료": [
    "Incomplete",
    "Chưa hoàn tất"
  ],
  "장비: {0}": [
    "Equipment: {0}",
    "Thiết bị: {0}"
  ],
  "관성 검증 조건: 출발 {0}g · 제동 {1}g · 회전 {2}g (앱 내부 비교 기준)": [
    "Inertia test conditions: acceleration {0}g · braking {1}g · cornering {2}g (internal app comparison)",
    "Điều kiện kiểm tra quán tính: tăng tốc {0}g · phanh {1}g · vào cua {2}g (so sánh nội bộ ứng dụng)"
  ],
  "물리검증: {0}": [
    "Physics verification: {0}",
    "Kiểm tra vật lý: {0}"
  ],
  "관성 최종검증: {0}": [
    "Final inertia verification: {0}",
    "Kiểm tra quán tính cuối: {0}"
  ],
  "보조재 추정중량: {0}": [
    "Estimated securing-material weight: {0}",
    "Khối lượng vật liệu hỗ trợ ước tính: {0}"
  ],
  "통합 출하·적재 작업지시서": [
    "Shipment and loading work order",
    "Lệnh xuất và xếp hàng"
  ],
  "위에서 본 바닥 위치 · C=수직 적층 자리 · P1→P2 순서로 위로 적층": [
    "Top-view floor positions · C=stack column · Stack upward P1→P2",
    "Vị trí sàn nhìn từ trên · C=cột xếp · Xếp lên theo P1→P2"
  ],
  "◀ 안쪽": [
    "◀ Inner end",
    "◀ Phía trong"
  ],
  "문쪽 ▶": [
    "Door end ▶",
    "Phía cửa ▶"
  ],
  "팔레트 위에서 본 적재도": [
    "Pallet loading top view",
    "Sơ đồ pallet nhìn từ trên"
  ],
  "C{0} / {1}단": [
    "C{0} / Layer {1}",
    "C{0} / Tầng {1}"
  ],
  "옆에서 본 적층 · 1단 먼저 · 같은 C번호의 상단 팔레트를 위에 적층": [
    "Side-view stacking · Layer 1 first · Stack upper pallets on the same C column",
    "Xếp tầng nhìn từ bên · Tầng 1 trước · Xếp pallet trên cùng số C"
  ],
  "팔레트 옆에서 본 적재도": [
    "Pallet loading side view",
    "Sơ đồ pallet nhìn từ bên"
  ],
  "밴딩 {0}줄/{1}m{2}": [
    "Banding {0} straps/{1}m{2}",
    "Đai {0} dây/{1}m{2}"
  ],
  "각대 {0}EA/{1}m": [
    "Corner guards {0}EA/{1}m",
    "Nẹp góc {0}EA/{1}m"
  ],
  "랩핑 {0}m": [
    "Wrapping {0}m",
    "Màng quấn {0}m"
  ],
  "미끄럼방지 {0}EA": [
    "Anti-slip {0}EA",
    "Chống trượt {0}EA"
  ],
  "추가 보강 없음": [
    "No additional reinforcement",
    "Không gia cố thêm"
  ],
  "컨테이너 안쪽부터 C{0} 위치에 바닥 배치": [
    "Place on the floor at C{0}, starting from the inner end",
    "Đặt trên sàn tại C{0}, bắt đầu từ phía trong"
  ],
  "C{0}의 {1}단 위에 {2}단 적층": [
    "Stack layer {2} above layer {1} at C{0}",
    "Xếp tầng {2} lên tầng {1} tại C{0}"
  ],
  "C{0} · {1}단": [
    "C{0} · Layer {1}",
    "C{0} · Tầng {1}"
  ],
  "바닥": [
    "Floor",
    "Sàn"
  ],
  "적층 접촉면": [
    "Stacking contact surface",
    "Bề mặt tiếp xúc giữa các tầng"
  ],
  "□ ① {0} 미끄럼방지재 {1}EA 설치": [
    "□ ① Install {1}EA anti-slip materials on {0}",
    "□ ① Lắp {1}EA vật liệu chống trượt trên {0}"
  ],
  "□ ② P{0} → C{1} {2}단 배치": [
    "□ ② Place P{0} → C{1}, layer {2}",
    "□ ② Đặt P{0} → C{1}, tầng {2}"
  ],
  "□ ③ 각대 {0}EA 설치 · 총 {1}m": [
    "□ ③ Install {0}EA corner guards · Total {1}m",
    "□ ③ Lắp {0}EA nẹp góc · Tổng {1}m"
  ],
  "□ ④ 밴딩 {0}줄 결속 · {1} · 총 {2}m": [
    "□ ④ Secure {0} banding straps · {1} · Total {2}m",
    "□ ④ Buộc {0} dây đai · {1} · Tổng {2}m"
  ],
  "□ ⑤ 랩핑 {0}m 적용": [
    "□ ⑤ Apply {0}m wrapping",
    "□ ⑤ Quấn {0}m màng"
  ],
  "□ ⑥ 흔들림 · 오버행 · 결속 풀림 확인": [
    "□ ⑥ Check movement, overhang and loose securing",
    "□ ⑥ Kiểm tra rung lắc, nhô ngoài và dây buộc lỏng"
  ],
  "C{0} · {1}단 · 적재높이 {2}mm": [
    "C{0} · Layer {1} · Load height {2}mm",
    "C{0} · Tầng {1} · Cao xếp hàng {2}mm"
  ],
  "추가 보강재 약 {0}kg": [
    "Additional reinforcement approx. {0}kg",
    "Vật liệu gia cố bổ sung khoảng {0}kg"
  ],
  "최종 공통 고정": [
    "Final shared securing",
    "Cố định chung cuối cùng"
  ],
  "모든 팔레트 배치 완료 후": [
    "After all pallets are placed",
    "Sau khi đặt xong tất cả pallet"
  ],
  "□ ⑦ 고정바 {0}EA 설치": [
    "□ ⑦ Install {0}EA load bars",
    "□ ⑦ Lắp {0}EA thanh chặn"
  ],
  "□ ⑧ 문 닫힘 · 고정바 간섭 · 최종 흔들림 확인": [
    "□ ⑧ Check door closure, load-bar interference and final movement",
    "□ ⑧ Kiểm tra đóng cửa, vướng thanh chặn và rung lắc cuối cùng"
  ],
  "고정바 약 {0}kg": [
    "Load bars approx. {0}kg",
    "Thanh chặn khoảng {0}kg"
  ],
  "팔레트": [
    "Pallet",
    "Pallet"
  ],
  "{0}줄 · {1}m": [
    "{0} straps · {1}m",
    "{0} dây · {1}m"
  ],
  "미끄럼방지": [
    "Anti-slip",
    "Chống trượt"
  ],
  "□ 준비 수량 확인": [
    "□ Check prepared quantity",
    "□ Kiểm tra số lượng chuẩn bị"
  ],
  "추가 보강": [
    "Additional reinforcement",
    "Gia cố bổ sung"
  ],
  "내부 기준 이내 · WHAT-IF 검토용": [
    "Within internal limits · WHAT-IF review only",
    "Trong giới hạn nội bộ · Chỉ xem xét WHAT-IF"
  ],
  "3종 PASS": [
    "3 scenarios PASS",
    "3 kịch bản PASS"
  ],
  "보조재 포함 최대중량 초과": [
    "Maximum weight exceeded including securing materials",
    "Vượt khối lượng tối đa kể cả vật liệu hỗ trợ"
  ],
  "출발 가속": [
    "Acceleration",
    "Tăng tốc"
  ],
  "급정거": [
    "Hard braking",
    "Phanh gấp"
  ],
  "급회전": [
    "Sharp turn",
    "Rẽ gấp"
  ],
  "{0} PASS 기준 초과 · 전체 {1}mm · 화물↔팔레트 {2}mm · 팔레트 {3}mm · 기울기 {4}°": [
    "{0} exceeds PASS limits · Overall {1}mm · Cargo↔pallet {2}mm · Pallet {3}mm · Tilt {4}°",
    "{0} vượt giới hạn PASS · Tổng thể {1}mm · Hàng↔pallet {2}mm · Pallet {3}mm · Nghiêng {4}°"
  ],
  "검증 미완료": [
    "Validation incomplete",
    "Chưa hoàn tất kiểm tra"
  ],
  "전체 최대 이동": [
    "Maximum overall movement",
    "Dịch chuyển tổng thể tối đa"
  ],
  "화물↔팔레트 미끄럼": [
    "Cargo↔pallet slip",
    "Trượt hàng↔pallet"
  ],
  "팔레트 상대 이동": [
    "Relative pallet movement",
    "Dịch chuyển tương đối của pallet"
  ],
  "최대 기울기": [
    "Maximum tilt",
    "Độ nghiêng tối đa"
  ],
  "최대 화물 구속력": [
    "Maximum cargo restraint force",
    "Lực giữ hàng tối đa"
  ],
  "최대 고정바 구속력": [
    "Maximum load-bar restraint force",
    "Lực giữ thanh chặn tối đa"
  ],
  "팔레트 적재 작업지시서": [
    "Pallet loading work order",
    "Lệnh xếp hàng pallet"
  ],
  "{0} · 그림 / 작업 표 / 결속 카드의 P번호를 맞춰 확인하세요.": [
    "{0} · Match P numbers in diagrams, work tables and securing cards.",
    "{0} · Đối chiếu số P trên hình, bảng công việc và thẻ buộc hàng."
  ],
  "관성 3종 · {0}": [
    "3 inertia scenarios · {0}",
    "3 kịch bản quán tính · {0}"
  ],
  "{0} × {1} × {2} m 장비": [
    "Equipment {0} × {1} × {2} m",
    "Thiết bị {0} × {1} × {2} m"
  ],
  "실제 적재 화물": [
    "Actual loaded cargo",
    "Hàng đã xếp thực tế"
  ],
  "팔레트화 중량": [
    "Palletized weight",
    "Khối lượng hàng trên pallet"
  ],
  "팔레트 적재 요약": [
    "Pallet loading summary",
    "Tóm tắt xếp hàng pallet"
  ],
  "작업 준비": [
    "Preparation",
    "Chuẩn bị"
  ],
  "필요 보조자재를 먼저 준비하고 팔레트 번호와 적층 위치를 확인하세요.": [
    "Prepare required securing materials first, then check pallet numbers and stack positions.",
    "Chuẩn bị vật liệu cố định trước, rồi kiểm tra số pallet và vị trí xếp tầng."
  ],
  "필요 보조자재 총량": [
    "Total required securing materials",
    "Tổng vật liệu cố định cần thiết"
  ],
  "번호 읽는 법:": [
    "Numbering guide:",
    "Hướng dẫn đọc số:"
  ],
  " P번호는 개별 팔레트, C번호는 같은 수직 적층 위치, 단수는 바닥부터의 높이 순서입니다. 투입은 아래 작업 표의 ": [
    " P identifies each pallet, C identifies a vertical stack position, and layers count upward from the floor. Follow the ",
    " P chỉ từng pallet, C chỉ vị trí cột xếp, và tầng được đếm từ sàn lên. Làm theo "
  ],
  "순서": [
    "Sequence",
    "Thứ tự"
  ],
  "를 따르세요.": [
    " in the work table below.",
    " trong bảng công việc bên dưới."
  ],
  "배치도 확인": [
    "Check layout diagrams",
    "Kiểm tra sơ đồ bố trí"
  ],
  "1단을 먼저 놓고 같은 C번호의 상단 팔레트를 순서대로 올리세요.": [
    "Place layer 1 first, then stack upper pallets in order on the same C column.",
    "Đặt tầng 1 trước, rồi lần lượt xếp pallet phía trên cùng số C."
  ],
  "◀ 안쪽부터 · 1단 먼저": [
    "◀ Start inside · Layer 1 first",
    "◀ Từ phía trong · Tầng 1 trước"
  ],
  "같은 C번호 위에 적층 · 문쪽 ▶": [
    "Stack on the same C column · Door end ▶",
    "Xếp trên cùng số C · Phía cửa ▶"
  ],
  "검은 선=밴딩 · 갈색 모서리=각대 · 파란 점선=랩핑 · 주황선=고정바": [
    "Black lines=banding · Brown corners=corner guards · Blue dashes=wrapping · Orange lines=load bars",
    "Đường đen=đai · Góc nâu=nẹp góc · Nét đứt xanh=màng quấn · Đường cam=thanh chặn"
  ],
  "투입 및 결속 작업": [
    "Loading and securing",
    "Xếp và buộc hàng"
  ],
  "작업 표 순서대로 배치한 후 같은 P번호의 결속 카드를 확인하세요.": [
    "Place pallets in the work-table order, then check the securing card with the same P number.",
    "Đặt pallet theo thứ tự bảng công việc, rồi kiểm tra thẻ buộc cùng số P."
  ],
  "팔레트 투입 순서 표": [
    "Pallet loading sequence table",
    "Bảng trình tự đưa pallet vào"
  ],
  "박스 구성": [
    "Carton contents",
    "Thành phần thùng"
  ],
  "중량 / 고정": [
    "Weight / Securing",
    "Khối lượng / Cố định"
  ],
  "놓을 위치": [
    "Placement position",
    "Vị trí đặt"
  ],
  "완료": [
    "Complete",
    "Hoàn tất"
  ],
  "팔레트 투입 순서": [
    "Pallet loading sequence",
    "Trình tự đưa pallet vào"
  ],
  "팔레트별 결속 작업 순서": [
    "Securing sequence for each pallet",
    "Trình tự buộc từng pallet"
  ],
  "미끄럼방지 → 배치 → 각대 → 밴딩 → 랩핑 → 확인": [
    "Anti-slip → Placement → Corner guards → Banding → Wrapping → Check",
    "Chống trượt → Đặt hàng → Nẹp góc → Đai → Màng quấn → Kiểm tra"
  ],
  "주의 · 검토용 문서입니다. 출고 전 보완 확인이 필요합니다.": [
    "Caution · For review only. Additional checks are required before dispatch.",
    "Thận trọng · Chỉ để xem xét. Cần kiểm tra bổ sung trước khi xuất hàng."
  ],
  "고정 상태를 대조한 뒤 담당자가 확인하세요.": [
    "Check the securing condition, then have the responsible person verify it.",
    "Đối chiếu tình trạng cố định, rồi người phụ trách xác nhận."
  ],
  "관성 테스트 권장 사항": [
    "Inertia test recommendations",
    "Khuyến nghị kiểm tra quán tính"
  ],
  "□ 밴딩/각대/랩핑 그림과 일치": [
    "□ Banding, guards and wrapping match the diagrams",
    "□ Đai, nẹp góc và màng quấn khớp hình"
  ],
  "□ 팔레트 흔들림·오버행 없음": [
    "□ No pallet movement or overhang",
    "□ Pallet không rung lắc hoặc nhô ngoài"
  ],
  "□ 문 닫힘/고정바 간섭 없음": [
    "□ No door-closing or load-bar interference",
    "□ Không vướng khi đóng cửa hoặc thanh chặn"
  ],
  "검증 근거": [
    "Verification evidence",
    "Căn cứ kiểm tra"
  ],
  "현장 작업을 마친 뒤 상세 수치와 자동 보강 이력을 대조하세요.": [
    "After field work, review detailed measurements and automatic reinforcement history.",
    "Sau khi làm việc tại hiện trường, đối chiếu số liệu chi tiết và lịch sử gia cố tự động."
  ],
  "자동 보강 이력": [
    "Automatic reinforcement history",
    "Lịch sử gia cố tự động"
  ],
  "관성 안전 지표": [
    "Inertia safety indicators",
    "Chỉ số an toàn quán tính"
  ],
  "관성 판정({0})은 시뮬레이터 내부 비교 결과이며 실제 운송 안전 인증을 의미하지 않습니다. ‘주의 · 검토용’은 내부 PASS 기준을 일부 초과했지만 위험 기준은 넘지 않은 결과이며 출고 승인을 의미하지 않습니다. 화물↔팔레트 미끄럼과 적층 팔레트 상대 이동을 함께 확인하고 표시된 권장사항을 출고 전 점검하세요. 표시된 kN은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않습니다.": [
    "The inertia verdict ({0}) is an internal simulator comparison, not transport safety certification. “Caution · For review” means some internal PASS limits are exceeded, but danger thresholds are not; it is not dispatch approval. Check both cargo↔pallet slip and relative movement of stacked pallets, and review all recommendations before dispatch. Displayed kN values compare the internal physics model and do not replace actual material ratings.",
    "Kết luận quán tính ({0}) là so sánh nội bộ của mô phỏng, không phải chứng nhận an toàn vận chuyển. “Thận trọng · Để xem xét” nghĩa là vượt một số giới hạn PASS nội bộ nhưng không vượt ngưỡng nguy hiểm; đây không phải phê duyệt xuất hàng. Kiểm tra cả độ trượt hàng↔pallet và dịch chuyển tương đối của pallet xếp tầng, đồng thời kiểm tra khuyến nghị trước khi xuất hàng. Giá trị kN hiển thị dùng để so sánh mô hình vật lý nội bộ, không thay thế định mức vật liệu thực tế."
  ],
  "별도 확인": [
    "Separate verification",
    "Kiểm tra riêng"
  ],
  "관성: {0} · 전체 {1} mm · 화물 {2} mm · 팔레트 {3} mm · {4}°": [
    "Inertia: {0} · Overall {1} mm · Cargo {2} mm · Pallet {3} mm · {4}°",
    "Quán tính: {0} · Tổng thể {1} mm · Hàng {2} mm · Pallet {3} mm · {4}°"
  ],
  "보조자재 약 {0} kg": [
    "Securing materials approx. {0} kg",
    "Vật liệu hỗ trợ khoảng {0} kg"
  ],
  "팔레트 작업지시서를 만들 적재 결과가 없습니다. 팔레트 자동 적재를 먼저 실행하세요.": [
    "No loading result is available for a pallet work order. Run automatic pallet loading first.",
    "Chưa có kết quả xếp hàng để lập lệnh pallet. Hãy chạy xếp pallet tự động trước."
  ],
  "팔레트 작업지시서는 현재 팔레트 적재안의 출발 가속·급정거·급회전 관성 시뮬레이션 3종을 먼저 완료해야 합니다.": [
    "Complete all three inertia simulations for the current pallet plan (acceleration, emergency braking and sharp cornering) before creating the pallet work order.",
    "Hoàn tất cả ba mô phỏng quán tính của phương án pallet hiện tại (tăng tốc, phanh gấp và cua gấp) trước khi lập lệnh pallet."
  ],
  "현재 팔레트 적재안은 관성 테스트에서 위험으로 판정되었거나 3종 검증이 완료되지 않았습니다. 재배치 또는 보강 후 다시 검증하세요.": [
    "The current pallet plan is rated dangerous or has not completed all three inertia checks. Rearrange or reinforce it, then verify again.",
    "Phương án pallet hiện tại bị đánh giá nguy hiểm hoặc chưa hoàn tất cả ba kiểm tra quán tính. Sắp xếp lại hoặc gia cố rồi kiểm tra lại."
  ],
  "팔레트 작업지시서": [
    "Pallet work order",
    "Lệnh làm việc pallet"
  ],
  "{0}단 전체": [
    "All of layer {0}",
    "Toàn bộ tầng {0}"
  ],
  "안쪽 → 문쪽": [
    "Inner end → Door end",
    "Phía trong → Phía cửa"
  ],
  "위에서 본 적재도 · 안쪽 → 문쪽": [
    "Loading top view · Inner end → Door end",
    "Sơ đồ xếp nhìn từ trên · Phía trong → Phía cửa"
  ],
  "좌/우 폭": [
    "Side-to-side width",
    "Chiều rộng trái/phải"
  ],
  "컨테이너 위에서 본 적재도": [
    "Container loading top view",
    "Sơ đồ container nhìn từ trên"
  ],
  "옆에서 본 적재도 · 바닥부터 위로": [
    "Loading side view · Floor upward",
    "Sơ đồ xếp nhìn từ bên · Từ sàn lên trên"
  ],
  "천장": [
    "Ceiling",
    "Trần"
  ],
  "컨테이너 옆에서 본 적재도": [
    "Container loading side view",
    "Sơ đồ container nhìn từ bên"
  ],
  "문 ▶": [
    "Door ▶",
    "Cửa ▶"
  ],
  "{0}단계 · {1}단까지": [
    "Step {0} · Through layer {1}",
    "Bước {0} · Đến tầng {1}"
  ],
  "작업 담당": [
    "Operator",
    "Người thao tác"
  ],
  "성명 / 서명": [
    "Name / Signature",
    "Họ tên / Chữ ký"
  ],
  "검토 담당": [
    "Reviewer",
    "Người kiểm tra"
  ],
  "확인 일시": [
    "Verification date/time",
    "Ngày giờ xác nhận"
  ],
  "년　　 월　　 일　　 시": [
    "Year　　 Month　　 Day　　 Time",
    "Năm　　 Tháng　　 Ngày　　 Giờ"
  ],
  "출고 전 작업 확인": [
    "Pre-dispatch work checks",
    "Kiểm tra công việc trước xuất hàng"
  ],
  "현재 검증 상태": [
    "Current verification status",
    "Trạng thái kiểm tra hiện tại"
  ],
  "LOAD STUDIO · 화면에서 검토한 후 A4로 인쇄하세요.": [
    "LOAD STUDIO · Review on screen, then print on A4.",
    "LOAD STUDIO · Xem trên màn hình rồi in khổ A4."
  ],
  "닫기": [
    "Close",
    "Đóng"
  ],
  "인쇄 / PDF 저장": [
    "Print / Save PDF",
    "In / Lưu PDF"
  ],
  "문서 목차": [
    "Document contents",
    "Mục lục tài liệu"
  ],
  "잔량 ": [
    "Partial ",
    "Lẻ "
  ],
  "{0}{1}개": [
    "{0}{1} units",
    "{0}{1} đơn vị"
  ],
  " 잔량": [
    " partial",
    " lẻ"
  ],
  "{0}{1} {2}개 · 바닥 높이 {3} mm": [
    "{0}{1} {2} units · Base height {3} mm",
    "{0}{1} {2} kiện · Cao độ đáy {3} mm"
  ],
  "위에서 보이는 최상단 배치": [
    "Topmost layout visible from above",
    "Bố trí tầng trên cùng nhìn từ trên"
  ],
  "바닥 +{0} mm의 배치": [
    "Layout at floor +{0} mm",
    "Bố trí tại sàn +{0} mm"
  ],
  "안쪽 벽 0 m": [
    "Inner wall 0 m",
    "Vách trong 0 m"
  ],
  "문 {0} m ▶": [
    "Door {0} m ▶",
    "Cửa {0} m ▶"
  ],
  "{0} · 빈 공간은 흰색 · 빨간 테두리는 잔량박스 · 도어 앞 여유 {1} mm": [
    "{0} · White=void · Red border=partial carton · Door clearance {1} mm",
    "{0} · Trắng=khoảng trống · Viền đỏ=thùng lẻ · Khoảng hở cửa {1} mm"
  ],
  "구역별 위에서 본 적재도": [
    "Loading top view by zone",
    "Sơ đồ xếp theo khu nhìn từ trên"
  ],
  "잔량": [
    "Partial",
    "Lẻ"
  ],
  "{0}개": [
    "{0} units",
    "{0} đơn vị"
  ],
  "{0}단 ": [
    "Layer {0} ",
    "Tầng {0} "
  ],
  "바닥 +{0} mm": [
    "Floor +{0} mm",
    "Sàn +{0} mm"
  ],
  "길이×폭 {0} mm": [
    "Length×width {0} mm",
    "Dài×rộng {0} mm"
  ],
  "{0}단 · 높이 {1} mm": [
    "{0} layers · Height {1} mm",
    "{0} tầng · Cao {1} mm"
  ],
  "구역별 적재 작업 순서": [
    "Loading sequence by zone",
    "Trình tự xếp hàng theo khu"
  ],
  "구역 · 안쪽 벽 기준": [
    "Zone · From inner wall",
    "Khu · Tính từ vách trong"
  ],
  "아래단부터 · 품목 / 수량 / 놓을 방향": [
    "Bottom layer first · Item / Quantity / Orientation",
    "Tầng dưới trước · Mặt hàng / Số lượng / Hướng đặt"
  ],
  "구역 합계": [
    "Zone total",
    "Tổng theo khu"
  ],
  "실제 배치 합계": [
    "Total actually placed",
    "Tổng đã đặt thực tế"
  ],
  " (잔량 {0} 포함)": [
    " (including {0} partial)",
    " (gồm {0} thùng lẻ)"
  ],
  "{0}개{1}": [
    "{0} units{1}",
    "{0} kiện{1}"
  ],
  "{0} {1}개{2}": [
    "{0} {1} units{2}",
    "{0} {1} kiện{2}"
  ],
  "3D 완료 모습": [
    "Completed 3D view",
    "Hình 3D hoàn chỉnh"
  ],
  "{0} {1} 구역 적재": [
    "{0} Zone {1} loading",
    "{0} Xếp hàng khu {1}"
  ],
  "안쪽 벽": [
    "Inner wall",
    "Vách trong"
  ],
  "{0} 잔량 1개": [
    "{0} 1 partial carton",
    "{0} 1 thùng lẻ"
  ],
  " · {0} 구역 · 바닥 +{1} mm · 안쪽 벽 {2} m / 도면 위쪽 벽 {3} m": [
    " · Zone {0} · Floor +{1} mm · Inner wall {2} m / Upper wall in plan {3} m",
    " · Khu {0} · Sàn +{1} mm · Vách trong {2} m / Vách phía trên sơ đồ {3} m"
  ],
  "잔량박스 위치 · 빨간 테두리": [
    "Partial-carton positions · Red border",
    "Vị trí thùng lẻ · Viền đỏ"
  ],
  "보조자재 설치 계획 미확인 · 실제 고정 위치는 현장 책임자가 확인하세요.": [
    "Securing-material installation plan unverified · The site supervisor must verify actual securing positions.",
    "Chưa kiểm tra kế hoạch lắp vật liệu hỗ trợ · Người phụ trách hiện trường phải xác nhận vị trí cố định thực tế."
  ],
  "① 파란 영역: 바닥 화물 접촉면 · 적재 전에 미끄럼방지재": [
    "① Blue area: cargo-floor contact · Install anti-slip materials before loading",
    "① Vùng xanh: tiếp xúc hàng-sàn · Lắp chống trượt trước khi xếp"
  ],
  "② 벽·화물 사이 및 내부 빈 칸: 유격 확인 후 블로킹": [
    "② Wall-cargo and internal gaps: check clearance, then block",
    "② Khe giữa vách-hàng và khoảng trống bên trong: kiểm tra khe hở rồi chèn chặn"
  ],
  "③ 문쪽 끝단 {0} m · 고정바": [
    "③ Door-side load end {0} m · Load bar",
    "③ Cuối hàng phía cửa {0} m · Thanh chặn"
  ],
  "표시는 설치 대상 영역입니다. 자재별 치수·정격·결박점 정보가 없어 개별 배치와 높이는 확정하지 않습니다. 블로킹은 잔량 주변의 상단 빈 칸도 확인하고, 현장 책임자가 수량·간섭·고정점을 대조하세요.": [
    "The marks show installation areas. Individual positions and heights are not finalized because material dimensions, ratings and securing-point data are unavailable. Also check upper gaps around partial cartons for blocking; the site supervisor must verify quantities, interference and securing points.",
    "Ký hiệu thể hiện khu vực lắp đặt. Chưa chốt vị trí và độ cao từng vật liệu do thiếu kích thước, định mức và thông tin điểm buộc. Khi chèn chặn, cũng kiểm tra khoảng trống phía trên quanh thùng lẻ; người phụ trách phải đối chiếu số lượng, chỗ vướng và điểm cố định."
  ],
  "보조자재 설치 영역 안내": [
    "Securing-material installation areas",
    "Khu vực lắp vật liệu hỗ trợ"
  ],
  "박스": [
    "Carton",
    "Thùng"
  ],
  "상차 전": [
    "Before loading",
    "Trước khi xếp hàng"
  ],
  "출고 서류와 실물 검수 (품명·수량·중량)": [
    "Check dispatch documents against goods (name, quantity, weight)",
    "Đối chiếu chứng từ xuất hàng với hàng thực tế (tên, số lượng, khối lượng)"
  ],
  "컨테이너 번호가 배차 서류와 일치": [
    "Container number matches dispatch documents",
    "Số container khớp chứng từ điều xe"
  ],
  "차량 번호·적재중량이 배차 서류와 일치": [
    "Vehicle number and load weight match dispatch documents",
    "Biển số xe và khối lượng xếp khớp chứng từ điều xe"
  ],
  "공컨테이너 점검: 도어를 닫고 빛샘 확인 (벽·지붕·바닥·도어 패킹)": [
    "Empty-container inspection: close doors and check light leaks (walls, roof, floor, door seals)",
    "Kiểm tra container rỗng: đóng cửa và kiểm tra lọt sáng (vách, mái, sàn, gioăng cửa)"
  ],
  "적재함 바닥·문짝·래싱 고리 손상 없음": [
    "No damage to cargo-bed floor, doors or lashing rings",
    "Sàn thùng xe, cửa và vòng chằng không hư hỏng"
  ],
  "내부 청소·건조 상태, 냄새·못·돌출물 없음": [
    "Interior clean and dry; no odors, nails or protrusions",
    "Bên trong sạch và khô; không mùi, đinh hoặc vật nhô ra"
  ],
  "팔레트 파손·젖음·오버행 없음, 랩핑·밴딩 상태 확인": [
    "Pallets undamaged and dry, no overhang; check wrapping and banding",
    "Pallet không hư hỏng, ướt hoặc nhô ngoài; kiểm tra màng quấn và đai"
  ],
  "박스 파손·젖음 없음": [
    "Cartons undamaged and dry",
    "Thùng không hư hỏng hoặc ướt"
  ],
  "수출 목재 팔레트는 열처리(HT) 마크 확인": [
    "Check heat-treatment (HT) mark on export wooden pallets",
    "Kiểm tra dấu xử lý nhiệt (HT) trên pallet gỗ xuất khẩu"
  ],
  "래싱벨트·각대·에어백 등 고정 자재 수량과 상태 확인": [
    "Check quantities and condition of securing materials (lashing belts, corner guards, airbags)",
    "Kiểm tra số lượng và tình trạng vật liệu cố định (dây chằng, nẹp góc, túi khí)"
  ],
  "고임목 설치, 지게차 작업 반경에 사람 없음": [
    "Wheel chocks installed; no people within forklift operating area",
    "Đã đặt chèn bánh; không có người trong vùng hoạt động xe nâng"
  ],
  "상차 중": [
    "During loading",
    "Trong khi xếp hàng"
  ],
  "작업지시서 순서대로, 안쪽 벽과 좌우 벽에 밀착": [
    "Follow the work-order sequence, close to the inner and side walls",
    "Theo thứ tự lệnh làm việc, sát vách trong và hai vách bên"
  ],
  "중량물은 아래, 취급 표시(천지무용·단수 제한) 준수": [
    "Heavy items below; observe handling marks (keep upright, layer limits)",
    "Hàng nặng ở dưới; tuân thủ ký hiệu xử lý (giữ đúng chiều, giới hạn tầng)"
  ],
  "{0} 사이와 벽 쪽 빈 공간에 지시된 메움재(에어백·허니콤) 설치": [
    "Install specified void fill (airbags, honeycomb) between {0} units and along walls",
    "Lắp vật liệu chèn quy định (túi khí, tổ ong) giữa các {0} và khoảng trống sát vách"
  ],
  "절반 상차 시점에 사진 촬영": [
    "Take photos when half loaded",
    "Chụp ảnh khi xếp được một nửa"
  ],
  "상차 후": [
    "After loading",
    "Sau khi xếp hàng"
  ],
  "도어 쪽 마감(쇼링·고정바) 확인": [
    "Check door-end restraint (shoring, load bars)",
    "Kiểm tra chặn phía cửa (chống đỡ, thanh chặn)"
  ],
  "래싱벨트 장력과 각대 확인": [
    "Check lashing-belt tension and corner guards",
    "Kiểm tra lực căng dây chằng và nẹp góc"
  ],
  "만재 상태와 도어를 닫은 상태 사진 촬영": [
    "Photograph the full load and closed doors",
    "Chụp ảnh khi xếp đầy và khi cửa đã đóng"
  ],
  "씰 체결, 씰 번호 기록": [
    "Apply seal and record seal number",
    "Niêm phong và ghi số niêm phong"
  ],
  "덮개(호루) 또는 결박으로 낙하 방지": [
    "Prevent falling cargo with a cover (tarpaulin) or lashings",
    "Ngăn hàng rơi bằng bạt phủ hoặc dây buộc"
  ],
  "수출 화물이면 VGM(검증 총중량) 제출": [
    "Submit VGM (verified gross mass) for export cargo",
    "Nộp VGM (khối lượng toàn bộ đã xác minh) cho hàng xuất khẩu"
  ],
  "적재 높이·폭·길이가 도로 운행 한도 이내": [
    "Loaded height, width and length within road limits",
    "Chiều cao, rộng và dài hàng xếp trong giới hạn đường bộ"
  ],
  "기사에게 화물 특성·중량·하차 순서·재조임 지점 전달": [
    "Brief the driver on cargo characteristics, weight, unloading sequence and re-tensioning stops",
    "Thông báo tài xế về đặc tính hàng, khối lượng, thứ tự dỡ và điểm siết lại"
  ],
  "씰 번호": [
    "Seal number",
    "Số niêm phong"
  ],
  "덮개·결박 확인자": [
    "Cover/lashing checked by",
    "Người kiểm tra bạt/dây buộc"
  ],
  "사진 기록 (공컨 · 절반 · 만재 · 도어 닫음)": [
    "Photo record (empty · half loaded · full · doors closed)",
    "Ảnh ghi nhận (rỗng · một nửa · đầy · cửa đóng)"
  ],
  "출발 후 재조임 지점": [
    "Re-tensioning stop after departure",
    "Điểm siết lại sau khởi hành"
  ],
  "현장 기록": [
    "Field records",
    "Ghi nhận hiện trường"
  ],
  "거래처": [
    "Customer",
    "Khách hàng"
  ],
  "목적지": [
    "Destination",
    "Điểm đến"
  ],
  "차량/컨테이너 No.": [
    "Vehicle/Container No.",
    "Số xe/container"
  ],
  "출고 예정": [
    "Planned dispatch",
    "Dự kiến xuất hàng"
  ],
  "출하정보 입력": [
    "Shipment information entry",
    "Nhập thông tin xuất hàng"
  ],
  "인쇄 전 출하정보 확인": [
    "Check shipment information before printing",
    "Kiểm tra thông tin xuất hàng trước khi in"
  ],
  "미입력": [
    "Not entered",
    "Chưa nhập"
  ],
  "출하정보 4개 항목을 입력하세요. 빈 항목은 인쇄본에 ‘미입력’으로 표시됩니다.": [
    "Complete the four shipment fields. Blank fields print as “Not entered”.",
    "Nhập đủ bốn mục xuất hàng. Mục trống sẽ in là “Chưa nhập”."
  ],
  "미입력: ": [
    "Not entered: ",
    "Chưa nhập: "
  ],
  "출하정보 입력 완료 · 내용을 확인한 뒤 인쇄하세요.": [
    "Shipment information complete · Check the details before printing.",
    "Đã nhập đủ thông tin xuất hàng · Kiểm tra nội dung trước khi in."
  ],
  "출하정보 미입력: ": [
    "Missing shipment information: ",
    "Thiếu thông tin xuất hàng: "
  ],
  "\n미입력 표시를 포함해 인쇄하시겠습니까?": [
    "\nPrint with missing-field labels?",
    "\nIn kèm nhãn mục chưa nhập?"
  ],
  "가로 {0}줄 + 세로 {1}줄 격자": [
    "Grid: {0} horizontal + {1} vertical straps",
    "Lưới: {0} dây ngang + {1} dây dọc"
  ],
  "앱 기본값이며 현장 자재로 확인 필요. 실제 자재 강도·정격을 보증하지 않음.": [
    "App defaults require verification against actual site materials. Actual material strength and ratings are not guaranteed.",
    "Giá trị mặc định của ứng dụng cần đối chiếu với vật liệu tại hiện trường. Không bảo đảm độ bền và định mức vật liệu thực tế."
  ],
  "측면 틈": [
    "Side gap",
    "Khe bên"
  ],
  "문쪽 끝단": [
    "Door-side end",
    "Đầu phía cửa"
  ],
  "높이 단차": [
    "Height step",
    "Chênh cao"
  ],
  "행 내부 틈": [
    "Internal row gap",
    "Khe trong hàng"
  ],
  "상부 틈": [
    "Top void",
    "Khoảng trống phía trên"
  ],
  "던니지 에어백": [
    "Dunnage airbag",
    "Túi khí chèn hàng"
  ],
  "종이 허니컴": [
    "Paper honeycomb",
    "Giấy tổ ong"
  ],
  "카고 로드바": [
    "Cargo load bar",
    "Thanh chặn hàng"
  ],
  "적용 자재 미확정": [
    "Material not yet determined",
    "Chưa xác định vật liệu áp dụng"
  ],
  "WHAT-IF REVIEW · 한도 비교 검토용 · 출고 승인 및 실제 운송 안전 인증 아님": [
    "WHAT-IF REVIEW · Limit comparison only · Not dispatch approval or actual transport safety certification",
    "WHAT-IF REVIEW · Chỉ xem xét so sánh giới hạn · Không phải phê duyệt xuất hàng hoặc chứng nhận an toàn vận chuyển thực tế"
  ],
  "원래 한도는 등록값·앱 기본값이며 실제 장비 명판/차량 인증 확인을 뜻하지 않습니다. 카탈로그 대표값은 실제 장비의 검증된 정격이 아닙니다. 시나리오 한도는 가정값이며 실제 한도와 오류 심각도는 변경되지 않습니다.": [
    "Original limits are registered values or app defaults; they do not confirm actual equipment nameplates or vehicle certification. Representative catalog values are not verified ratings of actual equipment. Scenario limits are assumptions; actual limits and error severity remain unchanged.",
    "Giới hạn gốc là giá trị đã đăng ký hoặc mặc định ứng dụng, không xác nhận nhãn thiết bị thực tế hay chứng nhận xe. Giá trị đại diện trong danh mục không phải định mức đã kiểm chứng của thiết bị thực tế. Giới hạn kịch bản là giả định; giới hạn thực tế và mức nghiêm trọng của lỗi không thay đổi."
  ],
  "관성 단독 검사 · 내부 기준 / 선택 가정 비교": [
    "Standalone inertia check · Internal limits / Selected assumptions",
    "Kiểm tra quán tính riêng · Giới hạn nội bộ / Giả định đã chọn"
  ],
  "WHAT-IF 원래 한도와 시나리오 비교": [
    "WHAT-IF original limits and scenario comparison",
    "So sánh giới hạn gốc và kịch bản WHAT-IF"
  ],
  "비교 수치가 없습니다. 미실행·유효하지 않은 시나리오는 승인할 수 없습니다.": [
    "No comparison values are available. Unrun or invalid scenarios cannot be approved.",
    "Không có số liệu so sánh. Không thể phê duyệt kịch bản chưa chạy hoặc không hợp lệ."
  ],
  "분류": [
    "Category",
    "Phân loại"
  ],
  "항목": [
    "Item",
    "Hạng mục"
  ],
  "화물": [
    "Cargo",
    "Hàng hóa"
  ],
  "단위": [
    "Unit",
    "Đơn vị"
  ],
  "원래한도": [
    "Original limit",
    "Giới hạn gốc"
  ],
  "시나리오한도": [
    "Scenario limit",
    "Giới hạn kịch bản"
  ],
  "실제값": [
    "Actual value",
    "Giá trị thực tế"
  ],
  "원래한도초과량": [
    "Excess over original limit",
    "Lượng vượt giới hạn gốc"
  ],
  "원래한도초과율_pct": [
    "Excess over original limit (%)",
    "Tỷ lệ vượt giới hạn gốc (%)"
  ],
  "한도방향": [
    "Limit direction",
    "Hướng giới hạn"
  ],
  "시나리오비교": [
    "Scenario comparison",
    "So sánh kịch bản"
  ],
  "근거": [
    "Provenance",
    "Nguồn căn cứ"
  ],
  "내부 시뮬레이션 기준 · 장비 정격 아님": [
    "Internal simulation limits · Not equipment ratings",
    "Giới hạn mô phỏng nội bộ · Không phải định mức thiết bị"
  ],
  "등록 한도 비교 · 실물 정격 확인 필요": [
    "Registered-limit comparison · Actual ratings require verification",
    "So sánh giới hạn đã đăng ký · Cần xác nhận định mức thực tế"
  ],
  "고정재 포함 총중량": [
    "Total weight including securing",
    "Tổng khối lượng gồm vật liệu cố định"
  ],
  "국부 바닥하중": [
    "Local floor load",
    "Tải sàn cục bộ"
  ],
  "최소 지지율": [
    "Minimum support ratio",
    "Tỷ lệ đỡ tối thiểu"
  ],
  "적층단수": [
    "Stacking layers",
    "Số tầng xếp"
  ],
  "누적 상부하중": [
    "Cumulative top load",
    "Tải phía trên tích lũy"
  ],
  "내부 관성 최대 이동": [
    "Internal maximum inertia displacement",
    "Dịch chuyển quán tính nội bộ tối đa"
  ],
  "내부 관성 최대 기울기": [
    "Internal maximum inertia tilt",
    "Độ nghiêng quán tính nội bộ tối đa"
  ],
  "등록값 · 실물 정격 미확인": [
    "Registered value · Actual rating unverified",
    "Giá trị đã đăng ký · Chưa xác nhận định mức thực tế"
  ],
  "앱 내부 기본값": [
    "Internal app default",
    "Mặc định nội bộ ứng dụng"
  ],
  "미검증 대표값": [
    "Unverified representative value",
    "Giá trị đại diện chưa kiểm chứng"
  ],
  "근거 미확인": [
    "Provenance unverified",
    "Chưa xác nhận nguồn căn cứ"
  ],
  "최소값 · 미달량 표시": [
    "Minimum · Shortfall shown",
    "Tối thiểu · Hiển thị lượng thiếu"
  ],
  "최대값": [
    "Maximum",
    "Tối đa"
  ],
  "가정 범위 이내 · 승인 아님": [
    "Within assumed range · Not approval",
    "Trong phạm vi giả định · Không phải phê duyệt"
  ],
  "가정 범위 초과": [
    "Outside assumed range",
    "Vượt phạm vi giả định"
  ],
  "한도 비교 검토용": [
    "Limit comparison only",
    "Chỉ xem xét so sánh giới hạn"
  ],
  "출고 승인 및 실제 운송 안전 인증 아님": [
    "Not dispatch approval or actual transport safety certification",
    "Không phải phê duyệt xuất hàng hoặc chứng nhận an toàn vận chuyển thực tế"
  ]
};
