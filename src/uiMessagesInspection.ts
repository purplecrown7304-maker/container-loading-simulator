/** Inspection and safety presentation only; canonical calculations and stored assessments stay unchanged. */
export const uiMessagesInspection: Readonly<Record<string, readonly [string, string]>> = {
  "현재 적재 결과를 직접 점검합니다. 계산 결과는 실제 운송 안전 인증이 아닙니다.": [
    "Inspect the current loading result. Calculated results are not actual transport safety certification.",
    "Kiểm tra kết quả xếp hàng hiện tại. Kết quả tính toán không phải chứng nhận an toàn vận chuyển thực tế."
  ],
  "점검 대상": [
    "Inspection target",
    "Đối tượng kiểm tra"
  ],
  "{0} 적재 · 상자 {1}개 · 팔레트 바닥판 {2}개": [
    "{0} loading · {1} boxes · {2} pallet bases",
    "Xếp {0} · {1} thùng · {2} đế pallet"
  ],
  "유효한 적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.": [
    "No valid loading result. Run automatic loading first.",
    "Chưa có kết quả xếp hàng hợp lệ. Hãy chạy xếp hàng tự động trước."
  ],
  "실행 취소": [
    "Cancel run",
    "Hủy chạy"
  ],
  "실행 중 {0}%": [
    "Running {0}%",
    "Đang chạy {0}%"
  ],
  "취소됨 · 결과 없음": [
    "Cancelled · No results",
    "Đã hủy · Không có kết quả"
  ],
  "실행 실패": [
    "Run failed",
    "Chạy thất bại"
  ],
  "미실행": [
    "Not run",
    "Chưa chạy"
  ],
  " 진행률": [
    " progress",
    " tiến độ"
  ],
  "다시 실행": [
    "Run again",
    "Chạy lại"
  ],
  "실행": [
    "Run",
    "Chạy"
  ],
  "닫기·뒤로 가기 시 실행 중인 계산과 점검 결과를 폐기합니다.": [
    "Closing or going back discards running calculations and inspection results.",
    "Đóng hoặc quay lại sẽ loại bỏ phép tính đang chạy và kết quả kiểm tra."
  ],
  "검사 진행 상황": [
    "Inspection progress",
    "Tiến độ kiểm tra"
  ],
  "적재 → 제약 → 무보강 Rapier → 최종 보강 검증 → 작업지시서": [
    "Loading → Constraints → Unsecured Rapier → Final secured validation → Work order",
    "Xếp hàng → Ràng buộc → Rapier chưa gia cố → Kiểm chứng gia cố cuối cùng → Phiếu công việc"
  ],
  "검사": [
    "Inspection",
    "Kiểm tra"
  ],
  "상황": [
    "Status",
    "Trạng thái"
  ],
  "계산 가정 ·": [
    "Calculation assumptions ·",
    "Giả định tính toán ·"
  ],
  "화물": [
    "Cargo",
    "Hàng hóa"
  ],
  "파렛트": [
    "Pallet",
    "Pallet"
  ],
  "최대 이동": [
    "Maximum movement",
    "Dịch chuyển tối đa"
  ],
  "고정재": [
    "Securing materials",
    "Vật liệu cố định"
  ],
  "계산한 상황": [
    "Scenarios calculated",
    "Kịch bản đã tính"
  ],
  "0.30g 출발 가속, 0.50g 급정거, 0.35g 급회전은 비교용 기본 상황입니다. Rapier 강체 시뮬레이션이며 실제 마찰·체결 성능과 도로 조건을 모두 재현하지 않습니다. 실제 운송 안전 인증이 아니며 현장 고정 상태를 별도로 확인해야 합니다. 입력 변경·닫기·뒤로 가기는 실행 중 계산과 재생 결과를 폐기합니다.": [
    "Acceleration at 0.30g, sudden braking at 0.50g and sharp turning at 0.35g are default comparison scenarios. This Rapier rigid-body simulation does not reproduce all real friction, fastening performance or road conditions. It is not actual transport safety certification; securing must be checked separately on site. Changing inputs, closing or going back discards running calculations and playback results.",
    "Tăng tốc 0.30g, phanh gấp 0.50g và rẽ gấp 0.35g là các kịch bản so sánh mặc định. Mô phỏng vật rắn Rapier này không tái hiện đầy đủ ma sát, hiệu quả liên kết và điều kiện đường thực tế. Đây không phải chứng nhận an toàn vận chuyển; cần kiểm tra cố định riêng tại hiện trường. Thay đổi đầu vào, đóng hoặc quay lại sẽ loại bỏ phép tính đang chạy và kết quả phát lại."
  ],
  "관성 애니메이션 테스트": [
    "Inertia animation test",
    "Kiểm tra hoạt ảnh quán tính"
  ],
  "현재 적재 결과의 움직임을 계산하고 3D로 재생합니다. 계산상 비교이며 실제 운송 안전 인증이 아닙니다.": [
    "Calculate movement of the current load and replay it in 3D. This is a computational comparison, not actual transport safety certification.",
    "Tính chuyển động của hàng đã xếp và phát lại bằng 3D. Đây là so sánh tính toán, không phải chứng nhận an toàn vận chuyển thực tế."
  ],
  "계산 결과·개선 보고서": [
    "Results and improvement report",
    "Báo cáo kết quả và cải thiện"
  ],
  "관성 테스트 닫기": [
    "Close inertia test",
    "Đóng kiểm tra quán tính"
  ],
  "관성 테스트 상황": [
    "Inertia test scenarios",
    "Kịch bản kiểm tra quán tính"
  ],
  " · 계산 완료": [
    " · Calculation complete",
    " · Tính toán hoàn tất"
  ],
  "관성 계산 취소": [
    "Cancel inertia calculation",
    "Hủy tính quán tính"
  ],
  "현재 상황 다시 계산": [
    "Recalculate current scenario",
    "Tính lại kịch bản hiện tại"
  ],
  "재생을 눌러 3D 움직임을 확인하세요.": [
    "Press play to view movement in 3D.",
    "Nhấn phát để xem chuyển động 3D."
  ],
  "Rapier 프레임 계산 중 ·": [
    "Calculating Rapier frames ·",
    "Đang tính khung hình Rapier ·"
  ],
  "관성 프레임 계산 진행률": [
    "Inertia frame calculation progress",
    "Tiến độ tính khung hình quán tính"
  ],
  "관성 적용 전 적재물 정착 중": [
    "Settling the load before inertia is applied",
    "Đang ổn định hàng trước khi áp dụng quán tính"
  ],
  "외력 제거 후 잔류 움직임 확인": [
    "Checking residual movement after external forces are removed",
    "Kiểm tra chuyển động còn lại sau khi bỏ ngoại lực"
  ],
  "관성 테스트 재생 위치": [
    "Inertia test playback position",
    "Vị trí phát kiểm tra quán tính"
  ],
  "처음부터": [
    "From the start",
    "Từ đầu"
  ],
  "재생": [
    "Play",
    "Phát"
  ],
  "재생 속도": [
    "Playback speed",
    "Tốc độ phát"
  ],
  "배": [
    "×",
    "×"
  ],
  "계산 조건·결과·주의사항": [
    "Calculation conditions, results and cautions",
    "Điều kiện tính toán, kết quả và lưu ý"
  ],
  "7. 관성 테스트": [
    "7. Inertia test",
    "7. Kiểm tra quán tính"
  ],
  "출발 · 급정거 · 급회전에서 적재물이 실제로 버티는지 3D 모션으로 확인합니다.": [
    "Use 3D motion to inspect how the load withstands acceleration, sudden braking and sharp turning.",
    "Dùng chuyển động 3D để kiểm tra hàng chịu tăng tốc, phanh gấp và rẽ gấp như thế nào."
  ],
  "관성 애니메이션 테스트 열기": [
    "Open inertia animation test",
    "Mở kiểm tra hoạt ảnh quán tính"
  ],
  "출발": [
    "Acceleration",
    "Tăng tốc"
  ],
  "최종 적재 결과 전 보강 안전 검증": [
    "Validate securing safety before final loading results",
    "Kiểm chứng an toàn gia cố trước kết quả xếp hàng cuối cùng"
  ],
  "출발 가속 · 급정거 · 급회전과 동일한 보강 조건의 물리 4종을 검증합니다. 기본 적재안이 실패하면 DIRECT BOX는 정적 안전점수가 높은 상위": [
    "Validate acceleration, sudden braking, sharp turning and four physics scenarios under the same securing conditions. If the baseline fails, DIRECT BOX compares only the top",
    "Kiểm chứng tăng tốc, phanh gấp, rẽ gấp và bốn kịch bản vật lý với cùng điều kiện gia cố. Nếu phương án cơ sở thất bại, DIRECT BOX chỉ so sánh thêm"
  ],
  "개 재배치만 추가 비교해 브라우저가 장시간 멈추는 것을 방지합니다.": [
    "rearrangements ranked by static safety to avoid prolonged browser freezes.",
    "phương án xếp lại có điểm an toàn tĩnh cao nhất để tránh trình duyệt bị treo lâu."
  ],
  "계산 취소": [
    "Cancel calculation",
    "Hủy tính toán"
  ],
  "결과 공개": [
    "Show results",
    "Hiển thị kết quả"
  ],
  "추가 안전 배치 계산 중": [
    "Calculating additional safe layouts",
    "Đang tính thêm phương án xếp an toàn"
  ],
  "재배치 {0}/{1} · 안전 후보 비교 · {2}": [
    "Rearrangement {0}/{1} · Comparing safe candidates · {2}",
    "Xếp lại {0}/{1} · So sánh phương án an toàn · {2}"
  ],
  "기본 적재": [
    "Baseline loading",
    "Xếp hàng cơ sở"
  ],
  "{0}/{1}회 · {2}": [
    "{0}/{1} runs · {2}",
    "{0}/{1} lần chạy · {2}"
  ],
  "{0} · {1} · 물리 계산 {2}%": [
    "{0} · {1} · Physics calculation {2}%",
    "{0} · {1} · Tính vật lý {2}%"
  ],
  "물리 계산 {0}%": [
    "Physics calculation {0}%",
    "Tính vật lý {0}%"
  ],
  "전체 이동": [
    "Overall movement",
    "Dịch chuyển tổng thể"
  ],
  "팔레트 이동": [
    "Pallet movement",
    "Dịch chuyển pallet"
  ],
  "화물 구속력": [
    "Cargo restraint force",
    "Lực giữ hàng"
  ],
  "팔레트 구속력": [
    "Pallet restraint force",
    "Lực giữ pallet"
  ],
  "통과 기준": [
    "Pass criteria",
    "Tiêu chí đạt"
  ],
  "이동 ≤": [
    "Movement ≤",
    "Dịch chuyển ≤"
  ],
  "mm · 기울기 ≤": [
    "mm · Tilt ≤",
    "mm · Độ nghiêng ≤"
  ],
  " · 상대미끄럼 ≤ {0}mm · 팔레트이동 ≤ {1}mm": [
    " · Relative slip ≤ {0}mm · Pallet movement ≤ {1}mm",
    " · Trượt tương đối ≤ {0}mm · Dịch chuyển pallet ≤ {1}mm"
  ],
  "자동 적용 적재 보조재": [
    "Automatically applied loading aids",
    "Vật liệu hỗ trợ xếp hàng áp dụng tự động"
  ],
  "박스 제외 약": [
    "Approx. excluding boxes",
    "Xấp xỉ, không gồm thùng"
  ],
  "줄": [
    "straps",
    "dây"
  ],
  "총": [
    "Total",
    "Tổng"
  ],
  "스트레치 필름": [
    "Stretch film",
    "Màng quấn co giãn"
  ],
  "팔레트/바닥": [
    "Pallet/floor",
    "Pallet/sàn"
  ],
  "박스/바닥": [
    "Box/floor",
    "Thùng/sàn"
  ],
  "빈 공간 이동 억제": [
    "Restrict movement in empty spaces",
    "Hạn chế dịch chuyển trong khoảng trống"
  ],
  "길이 방향 고정": [
    "Longitudinal securing",
    "Cố định theo chiều dọc"
  ],
  "보조자재 중량은 ‘적재 보조자재 실제 중량 설정’의 현장값으로 계산합니다. 계산된 구속력은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않습니다.": [
    "Loading-aid weight is calculated from site values in “Actual loading-aid weight settings”. Calculated restraint forces are internal physics-model comparisons and do not replace actual material ratings.",
    "Khối lượng vật liệu hỗ trợ được tính theo giá trị hiện trường trong “Cài đặt khối lượng thực của vật liệu hỗ trợ”. Lực giữ tính toán là giá trị so sánh của mô hình vật lý nội bộ, không thay thế định mức vật liệu thực tế."
  ],
  "최종 결과 잠금 유지": [
    "Final results remain locked",
    "Kết quả cuối cùng vẫn bị khóa"
  ],
  "현재 조건으로 다시 탐색": [
    "Search again with current conditions",
    "Tìm lại với điều kiện hiện tại"
  ],
  "관성 테스트 자세히 보기": [
    "View inertia test details",
    "Xem chi tiết kiểm tra quán tính"
  ],
  "적재안 수정": [
    "Edit loading plan",
    "Sửa phương án xếp hàng"
  ],
  "작업지시서 전 상자 안전 후보 비교": [
    "Compare safe box layouts before the work order",
    "So sánh phương án xếp thùng an toàn trước phiếu công việc"
  ],
  "출발 가속 · 급정거 · 급회전 3종을 비교해 더 안전한 배치를 우선합니다. 미통과 결과는 출고 승인 없이 위험 경고·보강 권장사항을 포함한 검토용 문서로만 생성합니다.": [
    "Compare acceleration, sudden braking and sharp turning to prioritize safer layouts. Results that do not pass are generated only as review documents with danger warnings and securing recommendations, without dispatch approval.",
    "So sánh tăng tốc, phanh gấp và rẽ gấp để ưu tiên phương án an toàn hơn. Kết quả không đạt chỉ được tạo thành tài liệu xem xét có cảnh báo nguy hiểm và khuyến nghị gia cố, không có phê duyệt xuất hàng."
  ],
  "추가 배치 계산 {0}/{1}회 · 최대 {2}초 · {3}": [
    "Additional layouts {0}/{1} runs · Up to {2}s · {3}",
    "Phương án bổ sung {0}/{1} lần · Tối đa {2} giây · {3}"
  ],
  "배치 {0}/{1} · {2}": [
    "Layout {0}/{1} · {2}",
    "Phương án {0}/{1} · {2}"
  ],
  "현재 보강": [
    "Current securing",
    "Gia cố hiện tại"
  ],
  "보강 물리 시나리오": [
    "Secured physics scenario",
    "Kịch bản vật lý có gia cố"
  ],
  "관성 시나리오": [
    "Inertia scenario",
    "Kịch bản quán tính"
  ],
  "현재 계산": [
    "Current calculation",
    "Tính toán hiện tại"
  ],
  "출력 정책": [
    "Output policy",
    "Chính sách xuất"
  ],
  "미통과는 검토용만": [
    "Non-passing results: review only",
    "Kết quả không đạt: chỉ để xem xét"
  ],
  "자동 비교 범위": [
    "Automatic comparison scope",
    "Phạm vi so sánh tự động"
  ],
  "화물 수량 유지": [
    "Keep cargo quantity",
    "Giữ nguyên số lượng hàng"
  ],
  "개 배치": [
    " layouts",
    " phương án"
  ],
  "상자 배치": [
    "Box layout",
    "Bố trí thùng"
  ],
  "안정성/적재율/하역": [
    "Stability / Utilization / Unloading",
    "Ổn định / Tỷ lệ xếp / Dỡ hàng"
  ],
  "전략별 고유 배치만 비교": [
    "Compare unique layouts for each strategy",
    "So sánh phương án riêng của từng chiến lược"
  ],
  "저중심 후보 우선": [
    "Prioritize low-center-of-gravity candidates",
    "Ưu tiên phương án trọng tâm thấp"
  ],
  "정적 안전점수로 선별": [
    "Select by static safety score",
    "Chọn theo điểm an toàn tĩnh"
  ],
  "후보 수": [
    "Candidate count",
    "Số phương án"
  ],
  "최대": [
    "Up to",
    "Tối đa"
  ],
  "추가 배치 계산 최대": [
    "Additional layout calculation up to",
    "Tính phương án bổ sung tối đa"
  ],
  "초": [
    "s",
    "giây"
  ],
  "출발·급정거·급회전": [
    "Acceleration / Sudden braking / Sharp turning",
    "Tăng tốc / Phanh gấp / Rẽ gấp"
  ],
  "가능한 3종 모두 확인": [
    "Check all three where possible",
    "Kiểm tra cả ba khi có thể"
  ],
  "주의 결과": [
    "Caution result",
    "Kết quả cần chú ý"
  ],
  "작업지시서 생성": [
    "Create work order",
    "Tạo phiếu công việc"
  ],
  "권장사항 자동 기입": [
    "Recommendations added automatically",
    "Tự động thêm khuyến nghị"
  ],
  "위험 결과": [
    "Danger result",
    "Kết quả nguy hiểm"
  ],
  "경고 포함 생성": [
    "Create with warnings",
    "Tạo kèm cảnh báo"
  ],
  "가장 낮은 위험안 + 보강 권장": [
    "Lowest-risk layout + securing recommendations",
    "Phương án rủi ro thấp nhất + khuyến nghị gia cố"
  ],
  "검증 처리 확인": [
    "Review validation processing",
    "Kiểm tra quá trình kiểm chứng"
  ],
  "추가 후보 비교를 중단하고 완료된 관성 검증 결과로 발급했습니다.": [
    "Further candidate comparisons were stopped; this was issued using completed inertia validation results.",
    "Đã dừng so sánh phương án bổ sung; tài liệu được phát hành theo kết quả kiểm chứng quán tính đã hoàn tất."
  ],
  "비교 중단하고 현재 검증 결과로 발급": [
    "Stop comparing and issue with current validation",
    "Dừng so sánh và phát hành theo kiểm chứng hiện tại"
  ],
  "작업지시서 열기": [
    "Open work order",
    "Mở phiếu công việc"
  ],
  "검증 등급:": [
    "Validation grade:",
    "Mức kiểm chứng:"
  ],
  "· 경고와 권장사항을 포함합니다.": [
    "· Includes warnings and recommendations.",
    "· Bao gồm cảnh báo và khuyến nghị."
  ],
  "작업지시서 전 팔레트 안전 후보 비교": [
    "Compare safe pallet layouts before the work order",
    "So sánh phương án pallet an toàn trước phiếu công việc"
  ],
  "출발 가속 · 급정거 · 급회전 3종을 비교해 더 안전한 팔레트안을 우선합니다. 모든 후보가 위험이어도 가장 낮은 위험안을 적용하고 위험 경고·고정 권장사항을 포함한 작업지시서를 생성합니다.": [
    "Compare acceleration, sudden braking and sharp turning to prioritize safer pallet layouts. Even if every candidate is dangerous, apply the lowest-risk layout and generate a work order with danger warnings and securing recommendations.",
    "So sánh tăng tốc, phanh gấp và rẽ gấp để ưu tiên phương án pallet an toàn hơn. Dù mọi phương án đều nguy hiểm, áp dụng phương án rủi ro thấp nhất và tạo phiếu công việc kèm cảnh báo nguy hiểm và khuyến nghị cố định."
  ],
  "후보 {0}/{1} · 비교 {2}%": [
    "Candidate {0}/{1} · Comparison {2}%",
    "Phương án {0}/{1} · So sánh {2}%"
  ],
  "후보 생성 중": [
    "Generating candidates",
    "Đang tạo phương án"
  ],
  "팔레트 위 상자": [
    "Boxes on pallets",
    "Thùng trên pallet"
  ],
  "방향 변경": [
    "Change orientation",
    "Đổi hướng"
  ],
  "자동/정방향/90도/교차 후보": [
    "Auto / Original / 90° / Crosswise candidates",
    "Phương án tự động / Hướng gốc / 90° / Xếp chéo"
  ],
  "유닛 높이": [
    "Unit height",
    "Chiều cao đơn vị"
  ],
  "안전한 층수 비교": [
    "Compare safe layer counts",
    "So sánh số tầng an toàn"
  ],
  "높은 위험 후보 후순위": [
    "Lower priority for high-risk candidates",
    "Hạ ưu tiên phương án rủi ro cao"
  ],
  "3종 검증": [
    "Three-scenario validation",
    "Kiểm chứng ba kịch bản"
  ],
  "가능한 모두 확인": [
    "Check all where possible",
    "Kiểm tra tất cả khi có thể"
  ],
  "전체 이동·기울기·상대이동 확인": [
    "Check overall movement, tilt and relative movement",
    "Kiểm tra dịch chuyển tổng thể, độ nghiêng và dịch chuyển tương đối"
  ],
  "실제 물리 안정성 종합검증": [
    "Comprehensive physical stability validation",
    "Kiểm chứng tổng hợp độ ổn định vật lý"
  ],
  "팔레트 바닥판과 박스를 함께 강체로 계산해 팔레트 적층까지 검사합니다.": [
    "Model pallet bases and boxes together as rigid bodies to inspect pallet stacking as well.",
    "Mô hình hóa đế pallet và thùng cùng nhau dưới dạng vật rắn để kiểm tra cả việc xếp chồng pallet."
  ],
  "현재 박스 적재안에 정적 중력·급제동·횡가속을 적용합니다.": [
    "Apply static gravity, sudden braking and lateral acceleration to the current box layout.",
    "Áp dụng trọng lực tĩnh, phanh gấp và gia tốc ngang cho bố trí thùng hiện tại."
  ],
  "리포트 / PDF": [
    "Report / PDF",
    "Báo cáo / PDF"
  ],
  "시뮬레이션 ·": [
    "Simulation ·",
    "Mô phỏng ·"
  ],
  "정적 중력 → 급제동 0.5g → 횡가속 0.35g 순으로 검증합니다.": [
    "Validate static gravity → sudden braking 0.5g → lateral acceleration 0.35g.",
    "Kiểm chứng theo thứ tự trọng lực tĩnh → phanh gấp 0.5g → gia tốc ngang 0.35g."
  ],
  "최악 조건:": [
    "Worst condition:",
    "Điều kiện xấu nhất:"
  ],
  "박스 {0} + 팔레트 {1}": [
    "{0} boxes + {1} pallets",
    "{0} thùng + {1} pallet"
  ],
  "박스 {0}": [
    "{0} boxes",
    "{0} thùng"
  ],
  "강체 검증": [
    "rigid-body validation",
    "kiểm chứng vật rắn"
  ],
  "점": [
    " points",
    " điểm"
  ],
  "박스 불안정": [
    "Unstable boxes",
    "Thùng không ổn định"
  ],
  "· 주의": [
    "· Caution",
    "· Chú ý"
  ],
  " · 팔레트 불안정 {0}": [
    " · Unstable pallets {0}",
    " · Pallet không ổn định {0}"
  ],
  "박스 안정": [
    "Stable boxes",
    "Thùng ổn định"
  ],
  "박스 주의": [
    "Boxes requiring caution",
    "Thùng cần chú ý"
  ],
  "팔레트 안정": [
    "Stable pallets",
    "Pallet ổn định"
  ],
  "팔레트 주의": [
    "Pallets requiring caution",
    "Pallet cần chú ý"
  ],
  "팔레트 불안정": [
    "Unstable pallets",
    "Pallet không ổn định"
  ],
  "최대 수평 이동": [
    "Maximum horizontal movement",
    "Dịch chuyển ngang tối đa"
  ],
  "최대 높이 변화": [
    "Maximum height change",
    "Thay đổi độ cao tối đa"
  ],
  "모든 시나리오 종료 시 정지 상태": [
    "Stationary at the end of every scenario",
    "Đứng yên khi kết thúc mọi kịch bản"
  ],
  "일부 시나리오 종료 시에도 움직임 감지": [
    "Movement detected at the end of some scenarios",
    "Phát hiện chuyển động khi kết thúc một số kịch bản"
  ],
  "최대 속도": [
    "Maximum speed",
    "Tốc độ tối đa"
  ],
  "m/s · 회전속도": [
    "m/s · Angular speed",
    "m/s · Tốc độ góc"
  ],
  "박스 재확인 위치": [
    "Box positions to recheck",
    "Vị trí thùng cần kiểm tra lại"
  ],
  "세 시나리오 중 가장 나쁜 결과를 기준으로 최대 30개 표시합니다.": [
    "Show up to 30 positions based on the worst result across three scenarios.",
    "Hiển thị tối đa 30 vị trí theo kết quả xấu nhất trong ba kịch bản."
  ],
  "물리 기준을 넘은 박스가 없습니다.": [
    "No boxes exceed the physics criteria.",
    "Không có thùng vượt tiêu chí vật lý."
  ],
  "다시 검증": [
    "Validate again",
    "Kiểm chứng lại"
  ],
  "불안정": [
    "Unstable",
    "Không ổn định"
  ],
  "주의": [
    "Caution",
    "Chú ý"
  ],
  "3D에서 보기 →": [
    "View in 3D →",
    "Xem trong 3D →"
  ],
  "팔레트 뷰에서 위치 확인": [
    "Check position in pallet view",
    "Kiểm tra vị trí trong chế độ xem pallet"
  ],
  "팔레트 재확인": [
    "Recheck pallets",
    "Kiểm tra lại pallet"
  ],
  "팔레트 자체의 이동·기울기 위험을 표시합니다.": [
    "Shows risks from movement and tilt of the pallets themselves.",
    "Hiển thị rủi ro dịch chuyển và nghiêng của chính pallet."
  ],
  "팔레트 지지체는 모두 안정 범위입니다.": [
    "All pallet supports are within the stable range.",
    "Tất cả đế đỡ pallet nằm trong phạm vi ổn định."
  ],
  "검증을 시작할 수 없습니다.": [
    "Cannot start validation.",
    "Không thể bắt đầu kiểm chứng."
  ],
  "물리 검증 준비 완료": [
    "Ready for physics validation",
    "Sẵn sàng kiểm chứng vật lý"
  ],
  "현재 적재 결과에 중력·급제동·횡가속을 적용합니다.": [
    "Apply gravity, sudden braking and lateral acceleration to the current loading result.",
    "Áp dụng trọng lực, phanh gấp và gia tốc ngang cho kết quả xếp hàng hiện tại."
  ],
  "종합 물리 검증 시작": [
    "Start comprehensive physics validation",
    "Bắt đầu kiểm chứng vật lý tổng hợp"
  ],
  "0.5g 급제동과 0.35g 횡가속은 비교·경고용 기본 시나리오입니다. 실제 운송 안전 판정에는 차량·도로·고정장치·마찰계수·포장재 강도 등 회사/법규 기준을 별도로 적용해야 합니다.": [
    "Sudden braking at 0.5g and lateral acceleration at 0.35g are default comparison and warning scenarios. Actual transport safety assessment must separately apply company and legal requirements for the vehicle, road, securing devices, friction and packaging strength.",
    "Phanh gấp 0.5g và gia tốc ngang 0.35g là kịch bản mặc định để so sánh và cảnh báo. Đánh giá an toàn vận chuyển thực tế phải áp dụng riêng tiêu chuẩn công ty và pháp luật về xe, đường, thiết bị cố định, ma sát và độ bền bao bì."
  ],
  "적재 보조자재 실제 중량 설정": [
    "Actual loading-aid weight settings",
    "Cài đặt khối lượng thực của vật liệu hỗ trợ"
  ],
  "현장에서 쓰는 자재의 실제 단위중량을 입력하면 관성검증의 추가중량·최대중량 판정과 작업지시서/Excel에 반영됩니다.": [
    "Enter actual unit weights of site materials. These affect added weight and payload checks in inertia validation, work orders and Excel.",
    "Nhập khối lượng đơn vị thực của vật liệu tại hiện trường. Các giá trị này ảnh hưởng đến khối lượng bổ sung và kiểm tra tải trọng trong kiểm chứng quán tính, phiếu công việc và Excel."
  ],
  "기본값": [
    "Defaults",
    "Mặc định"
  ],
  "현장값 저장": [
    "Save site values",
    "Lưu giá trị hiện trường"
  ],
  "저장됨 · 기존 관성 PASS 재검증 필요": [
    "Saved · Existing inertia PASS requires revalidation",
    "Đã lưu · Kết quả PASS quán tính cũ cần kiểm chứng lại"
  ],
  "메움재 값은 앱 기본 계획값이며 현장 자재로 확인 필요합니다. 자재의 실제 강도·정격을 보증하지 않습니다. 밴딩/랩핑의 시뮬레이션 구속 성능계수는 안전상 임의 변경하지 않습니다.": [
    "Void-fill values are default planning estimates and must be checked against site materials. They do not guarantee actual material strength or ratings. Banding/wrapping restraint coefficients cannot be arbitrarily changed for safety reasons.",
    "Giá trị vật liệu chèn là ước tính lập kế hoạch mặc định và cần đối chiếu vật liệu hiện trường. Chúng không bảo đảm độ bền hay định mức thực tế. Vì an toàn, không tùy ý đổi hệ số giữ của đai/màng quấn trong mô phỏng."
  ],
  "작업자 취급 위험 점검": [
    "Worker handling risk check",
    "Kiểm tra rủi ro thao tác của công nhân"
  ],
  "현장 기준값을 직접 설정합니다.": [
    "Set your own site thresholds.",
    "Tự đặt ngưỡng hiện trường."
  ],
  "고위험 {0}": [
    "High risk {0}",
    "Rủi ro cao {0}"
  ],
  "양호": [
    "Good",
    "Tốt"
  ],
  "편안한 도달 높이(m)": [
    "Comfortable reach height (m)",
    "Chiều cao với tới thuận tiện (m)"
  ],
  "수동 취급 기준(kg)": [
    "Manual handling threshold (kg)",
    "Ngưỡng thao tác thủ công (kg)"
  ],
  "현재 설정 기준으로 높이·중량 취급 위험이 감지되지 않았습니다.": [
    "No height or weight handling risks detected under the current settings.",
    "Không phát hiện rủi ro thao tác về chiều cao hoặc khối lượng theo cài đặt hiện tại."
  ],
  "이 점검은 사용자가 입력한 현장 기준에 따른 작업 보조용 표시이며 법적·인체공학적 적합성 판정을 대신하지 않습니다.": [
    "This check supports operations using user-entered site criteria. It does not replace legal or ergonomic compliance assessments.",
    "Kiểm tra này hỗ trợ thao tác theo tiêu chí hiện trường do người dùng nhập, không thay thế đánh giá tuân thủ pháp luật hoặc công thái học."
  ],
  "정적 중력": [
    "Static gravity",
    "Trọng lực tĩnh"
  ],
  "출발 가속 0.3g": [
    "Acceleration 0.3g",
    "Tăng tốc 0.3g"
  ],
  "급제동 0.5g": [
    "Sudden braking 0.5g",
    "Phanh gấp 0.5g"
  ],
  "횡가속 0.35g": [
    "Lateral acceleration 0.35g",
    "Gia tốc ngang 0.35g"
  ],
  "불안정 위치 확인 필요": [
    "Unstable positions need checking",
    "Cần kiểm tra vị trí không ổn định"
  ],
  "주의 위치 확인 필요": [
    "Caution positions need checking",
    "Cần kiểm tra vị trí cần chú ý"
  ],
  "주의·불안정 항목 없음": [
    "No caution or unstable items",
    "Không có mục cần chú ý hoặc không ổn định"
  ],
  "안정": [
    "Stable",
    "Ổn định"
  ],
  "· 불안정": [
    "· Unstable",
    "· Không ổn định"
  ],
  "수평": [
    "Horizontal",
    "Ngang"
  ],
  "높이": [
    "Height",
    "Chiều cao"
  ],
  "재확인 위치": [
    "Position to recheck",
    "Vị trí cần kiểm tra lại"
  ],
  "측정값": [
    "Measurements",
    "Giá trị đo"
  ],
  "확인 사유": [
    "Reason for checking",
    "Lý do kiểm tra"
  ],
  "컨테이너 물리 안정성 검증 리포트": [
    "Container physical stability validation report",
    "Báo cáo kiểm chứng ổn định vật lý container"
  ],
  "{0} · 정적 중력 / 급제동 / 횡가속 종합검증": [
    "{0} · Combined static gravity / sudden braking / lateral acceleration validation",
    "{0} · Kiểm chứng tổng hợp trọng lực tĩnh / phanh gấp / gia tốc ngang"
  ],
  "WHAT-IF REVIEW · 출고 승인 아님": [
    "WHAT-IF REVIEW · Not dispatch approval",
    "WHAT-IF REVIEW · Không phải phê duyệt xuất hàng"
  ],
  "물리 검증 요약": [
    "Physics validation summary",
    "Tóm tắt kiểm chứng vật lý"
  ],
  "종합점수": [
    "Overall score",
    "Điểm tổng thể"
  ],
  "불안정 박스 / 팔레트": [
    "Unstable boxes / pallets",
    "Thùng / pallet không ổn định"
  ],
  "주의 박스 / 팔레트": [
    "Caution boxes / pallets",
    "Thùng / pallet cần chú ý"
  ],
  "최악 조건": [
    "Worst condition",
    "Điều kiện xấu nhất"
  ],
  "우선 재확인 위치": [
    "Priority positions to recheck",
    "Vị trí ưu tiên kiểm tra lại"
  ],
  "불안정 항목을 먼저 표시합니다. 사유와 위치를 대조하고 조치 후 확인 칸에 표시하세요.": [
    "Unstable items are shown first. Match each reason to its position, take corrective action and mark the check box.",
    "Mục không ổn định hiển thị trước. Đối chiếu lý do với vị trí, xử lý rồi đánh dấu ô kiểm tra."
  ],
  "박스 재확인 위치 ·": [
    "Box positions to recheck ·",
    "Vị trí thùng cần kiểm tra lại ·"
  ],
  "시나리오별 결과": [
    "Results by scenario",
    "Kết quả theo kịch bản"
  ],
  "점수와 함께 주의·불안정 개수, 최대 이동량, 기울기를 비교하세요.": [
    "Compare scores, caution/unstable counts, maximum movement and tilt.",
    "So sánh điểm, số mục cần chú ý/không ổn định, dịch chuyển tối đa và độ nghiêng."
  ],
  "높이 변화는 위·아래 이동의 절댓값입니다. XYZ는 적재안의 배치 좌표(m)이며, 박스 번호는 적재 결과의 개별 배치 번호입니다.": [
    "Height change is the absolute upward or downward movement. XYZ are placement coordinates (m), and box numbers identify individual placements in the loading result.",
    "Thay đổi độ cao là độ dịch chuyển lên hoặc xuống tuyệt đối. XYZ là tọa độ bố trí (m); số thùng chỉ từng vị trí trong kết quả xếp hàng."
  ],
  "검증 대상 및 최종 확인": [
    "Validation target and final checks",
    "Đối tượng kiểm chứng và kiểm tra cuối cùng"
  ],
  "실제 장비와 포장·고정 조건을 대조하고, 보완한 적재안은 다시 검증하세요.": [
    "Check actual equipment, packaging and securing conditions; revalidate any revised layout.",
    "Đối chiếu thiết bị, bao bì và điều kiện cố định thực tế; kiểm chứng lại phương án đã sửa."
  ],
  "팔레트/지지체": [
    "Pallets/supports",
    "Pallet/đế đỡ"
  ],
  "장비 내부 규격": [
    "Equipment internal dimensions",
    "Kích thước trong của thiết bị"
  ],
  "표시된 박스와 팔레트의 재확인 위치를 현장 배치와 대조": [
    "Match the listed box and pallet recheck positions to the actual layout",
    "Đối chiếu vị trí thùng và pallet cần kiểm tra lại với bố trí thực tế"
  ],
  "실제 포장 강도·마찰·고정장치 조건을 확인": [
    "Check actual packaging strength, friction and securing conditions",
    "Kiểm tra độ bền bao bì, ma sát và điều kiện cố định thực tế"
  ],
  "재배치 또는 보강 후 같은 조건으로 재검증": [
    "Revalidate under the same conditions after rearrangement or securing",
    "Kiểm chứng lại cùng điều kiện sau khi xếp lại hoặc gia cố"
  ],
  "본 결과는 적재안 비교와 위험 위치 탐색을 위한 보조 시뮬레이션입니다. 실제 운송 안전 판정에는 박스 압축강도, 팔레트/고정장치, 실제 마찰계수, 차량 가감속, 진동, 도로조건 및 관련 법규·사내 기준을 별도로 적용해야 합니다.": [
    "This is an auxiliary simulation for comparing layouts and locating risks. Actual transport safety assessment must separately consider box compression strength, pallets and securing devices, actual friction, vehicle acceleration/deceleration, vibration, road conditions and applicable legal/company standards.",
    "Đây là mô phỏng hỗ trợ so sánh bố trí và tìm vị trí rủi ro. Đánh giá an toàn vận chuyển thực tế phải xét riêng độ bền nén thùng, pallet và thiết bị cố định, ma sát thực, tăng/giảm tốc xe, rung động, điều kiện đường và tiêu chuẩn pháp luật/công ty áp dụng."
  ],
  "· 최대 기울기": [
    "· Maximum tilt",
    "· Độ nghiêng tối đa"
  ],
  "장비 최대 적재중량": [
    "Equipment maximum payload",
    "Tải trọng tối đa của thiết bị"
  ],
  "위험": [
    "Danger",
    "Nguy hiểm"
  ],
  "보완 권장": [
    "Improvements recommended",
    "Khuyến nghị cải thiện"
  ],
  "최대 이동 {0}, 최대 기울기 {1}, 화물↔팔레트 {2}, 팔레트 이동 {3}로 내부 PASS 범위입니다.": [
    "Maximum movement {0}, maximum tilt {1}, cargo↔pallet slip {2} and pallet movement {3} are within the internal PASS range.",
    "Dịch chuyển tối đa {0}, độ nghiêng tối đa {1}, trượt hàng↔pallet {2} và dịch chuyển pallet {3} nằm trong phạm vi PASS nội bộ."
  ],
  "최대 이동 {0}, 최대 기울기 {1}로 내부 PASS 범위입니다.": [
    "Maximum movement {0} and maximum tilt {1} are within the internal PASS range.",
    "Dịch chuyển tối đa {0} và độ nghiêng tối đa {1} nằm trong phạm vi PASS nội bộ."
  ],
  "수평 이동 {0} · 위험 기준 초과": [
    "Horizontal movement {0} · Exceeds danger threshold",
    "Dịch chuyển ngang {0} · Vượt ngưỡng nguy hiểm"
  ],
  "수평 이동 {0} · PASS 기준 초과/위험 이내": [
    "Horizontal movement {0} · Above PASS threshold / within danger limit",
    "Dịch chuyển ngang {0} · Vượt ngưỡng PASS / trong giới hạn nguy hiểm"
  ],
  "기울기 {0} · 위험 기준 초과": [
    "Tilt {0} · Exceeds danger threshold",
    "Độ nghiêng {0} · Vượt ngưỡng nguy hiểm"
  ],
  "기울기 {0} · PASS 기준 초과/위험 이내": [
    "Tilt {0} · Above PASS threshold / within danger limit",
    "Độ nghiêng {0} · Vượt ngưỡng PASS / trong giới hạn nguy hiểm"
  ],
  "화물↔팔레트 미끄럼 {0} · 위험 기준 초과": [
    "Cargo↔pallet slip {0} · Exceeds danger threshold",
    "Trượt hàng↔pallet {0} · Vượt ngưỡng nguy hiểm"
  ],
  "화물↔팔레트 미끄럼 {0} · PASS 기준 초과/위험 이내": [
    "Cargo↔pallet slip {0} · Above PASS threshold / within danger limit",
    "Trượt hàng↔pallet {0} · Vượt ngưỡng PASS / trong giới hạn nguy hiểm"
  ],
  "팔레트 이동 {0} · 위험 기준 초과": [
    "Pallet movement {0} · Exceeds danger threshold",
    "Dịch chuyển pallet {0} · Vượt ngưỡng nguy hiểm"
  ],
  "팔레트 이동 {0} · PASS 기준 초과/위험 이내": [
    "Pallet movement {0} · Above PASS threshold / within danger limit",
    "Dịch chuyển pallet {0} · Vượt ngưỡng PASS / trong giới hạn nguy hiểm"
  ],
  "최대 이동 {0}, 최대 기울기 {1}로 추가 확인이 필요합니다.": [
    "Maximum movement {0} and maximum tilt {1} require further checking.",
    "Dịch chuyển tối đa {0} và độ nghiêng tối đa {1} cần kiểm tra thêm."
  ],
  "바닥·팔레트 접촉면의 미끄럼 방지 상태를 확인하고 필요 시 미끄럼방지재를 적용합니다.": [
    "Check slip resistance at floor/pallet contact surfaces and apply anti-slip materials if needed.",
    "Kiểm tra chống trượt tại mặt tiếp xúc sàn/pallet và dùng vật liệu chống trượt nếu cần."
  ],
  "화물 사이의 큰 빈 공간을 줄이고 빈 공간은 적절한 완충·고정재로 채워 이동 여유를 줄입니다.": [
    "Reduce large gaps between cargo and fill voids with suitable cushioning/securing materials to restrict movement.",
    "Giảm khoảng trống lớn giữa hàng và chèn vật liệu đệm/cố định phù hợp để hạn chế dịch chuyển."
  ],
  "높은 적층은 낮추고 무거운 화물을 하부에 배치해 무게중심을 낮춥니다.": [
    "Lower tall stacks and place heavy cargo at the bottom to lower the center of gravity.",
    "Giảm chiều cao chồng và đặt hàng nặng ở dưới để hạ trọng tâm."
  ],
  "열 또는 블록 단위의 랩핑·밴딩·결박 필요성을 검토하고 상단 돌출 적재를 줄입니다.": [
    "Review wrapping, banding or lashing by row/block and reduce protruding upper loads.",
    "Xem xét quấn màng, đóng đai hoặc chằng buộc theo hàng/khối và giảm hàng nhô ra ở trên."
  ],
  "화물-팔레트 상대 미끄럼이 있으므로 밴딩·랩핑·미끄럼방지재가 화물과 팔레트를 함께 구속하는지 확인합니다.": [
    "Cargo slips relative to the pallet. Check that banding, wrapping and anti-slip materials restrain both cargo and pallet together.",
    "Hàng trượt tương đối với pallet. Kiểm tra đai, màng quấn và vật liệu chống trượt giữ hàng cùng pallet."
  ],
  "팔레트 자체 이동을 줄이도록 바닥 접촉면, 고정바와 블로킹 위치를 확인합니다.": [
    "Check floor contact, load bars and blocking positions to reduce pallet movement.",
    "Kiểm tra tiếp xúc sàn, thanh chặn và vị trí chèn để giảm dịch chuyển pallet."
  ],
  "출발 시 후방 관성 방향으로 밀리지 않도록 길이 방향 후방 지지·블로킹 상태를 점검합니다.": [
    "Check rear longitudinal support and blocking to prevent rearward movement during acceleration.",
    "Kiểm tra đỡ và chèn phía sau theo chiều dọc để ngăn dịch chuyển về sau khi tăng tốc."
  ],
  "급제동 시 전방 관성 방향으로 밀리지 않도록 앞쪽 지지·블로킹과 문쪽 끝단의 이동 여유를 점검합니다.": [
    "Check front support/blocking and door-end clearance to prevent forward movement during sudden braking.",
    "Kiểm tra đỡ/chèn phía trước và khoảng hở đầu cửa để ngăn dịch chuyển về trước khi phanh gấp."
  ],
  "좌우 측벽 여유를 줄이고 좌우 중량 편차 및 상단 편중을 줄여 측면 전도 가능성을 낮춥니다.": [
    "Reduce sidewall gaps, lateral weight imbalance and upper-load concentration to reduce sideways tipping risk.",
    "Giảm khoảng hở thành bên, lệch khối lượng trái/phải và tập trung hàng phía trên để giảm nguy cơ lật ngang."
  ],
  "팔레트-바닥 고정과 화물-팔레트 결속을 각각 분리해 확인하고, 랩핑/밴딩이 팔레트와 화물을 함께 구속하는지 점검합니다.": [
    "Check pallet-to-floor securing and cargo-to-pallet restraint separately, including whether wrapping/banding restrains both together.",
    "Kiểm tra riêng cố định pallet với sàn và hàng với pallet, kể cả việc màng quấn/đai giữ cả hai cùng nhau."
  ],
  "현재 결과를 기준선으로 저장하고 실제 포장재·마찰계수·결박 조건을 반영한 재시험으로 확인합니다.": [
    "Save this result as a baseline and confirm it by retesting with actual packaging, friction and lashing conditions.",
    "Lưu kết quả làm cơ sở và xác nhận bằng kiểm tra lại với bao bì, ma sát và điều kiện chằng buộc thực tế."
  ],
  "검사 미완료": [
    "Inspection incomplete",
    "Kiểm tra chưa hoàn tất"
  ],
  "내부 기준 초과": [
    "Internal criteria exceeded",
    "Vượt tiêu chí nội bộ"
  ],
  "내부 기준 이내": [
    "Within internal criteria",
    "Trong tiêu chí nội bộ"
  ],
  "위험 · 작업지시서 생성 불가": [
    "Danger · Work order cannot be generated",
    "Nguy hiểm · Không thể tạo phiếu công việc"
  ],
  "검증 미완료 · 남은 시나리오 실행 필요": [
    "Validation incomplete · Run remaining scenarios",
    "Kiểm chứng chưa hoàn tất · Chạy kịch bản còn lại"
  ],
  "위험 아님 · 권장사항 반영 후 작업지시서 생성 가능": [
    "Not dangerous · Work order available after applying recommendations",
    "Không nguy hiểm · Có thể tạo phiếu sau khi áp dụng khuyến nghị"
  ],
  "안정 · 작업지시서 생성 가능": [
    "Stable · Work order available",
    "Ổn định · Có thể tạo phiếu công việc"
  ],
  "시나리오를 실행한 뒤 결과를 확인하세요.": [
    "Run the scenario to view its results.",
    "Chạy kịch bản để xem kết quả."
  ],
  "보완 조치 후 같은 3개 시나리오를 다시 실행해 최대 이동량과 기울기가 감소했는지 비교": [
    "After improvements, rerun the same three scenarios and compare reductions in maximum movement and tilt",
    "Sau khi cải thiện, chạy lại ba kịch bản để so sánh mức giảm dịch chuyển tối đa và độ nghiêng"
  ],
  "상자 적재는 상단 블록과 문쪽/안쪽 끝단, 팔레트 적재는 팔레트 자체 이동과 화물-팔레트 상대 이동을 함께 관찰": [
    "For boxes, observe upper blocks and door/inner ends; for pallets, observe pallet movement and cargo-to-pallet relative movement",
    "Với thùng, quan sát khối trên và đầu cửa/phía trong; với pallet, quan sát dịch chuyển pallet và chuyển động tương đối hàng-pallet"
  ],
  "실제 현장 포장재, 미끄럼방지재, 결박 방식, 팔레트 규격을 시뮬레이션 입력/운영 기준과 대조": [
    "Compare actual site packaging, anti-slip materials, lashing methods and pallet specifications with simulation inputs and operating standards",
    "Đối chiếu bao bì, vật liệu chống trượt, cách chằng buộc và quy cách pallet thực tế với đầu vào mô phỏng và tiêu chuẩn vận hành"
  ],
  "시뮬레이션 결과만으로 운송 안전을 확정하지 않고 회사·운송사·법규 기준으로 최종 검토": [
    "Do not confirm transport safety from simulation alone; conduct a final review against company, carrier and legal standards",
    "Không xác nhận an toàn vận chuyển chỉ từ mô phỏng; xem xét cuối cùng theo tiêu chuẩn công ty, đơn vị vận tải và pháp luật"
  ],
  "관성 테스트 보완 보고서": [
    "Inertia test improvement report",
    "Báo cáo cải thiện kiểm tra quán tính"
  ],
  "{0} · {1} · Rapier 3D 관성 애니메이션 결과 기반": [
    "{0} · {1} · Based on Rapier 3D inertia animation results",
    "{0} · {1} · Dựa trên kết quả hoạt ảnh quán tính Rapier 3D"
  ],
  "관성 검증 요약": [
    "Inertia validation summary",
    "Tóm tắt kiểm chứng quán tính"
  ],
  "실행 시나리오": [
    "Scenarios run",
    "Kịch bản đã chạy"
  ],
  "실행 결과 중 최악 조건": [
    "Worst condition among completed runs",
    "Điều kiện xấu nhất trong các lần đã chạy"
  ],
  "종합 평가와 보완할 점": [
    "Overall assessment and improvements",
    "Đánh giá tổng thể và cải thiện"
  ],
  "현재 판정과 우선 조치사항을 먼저 확인하세요.": [
    "Check the current assessment and priority actions first.",
    "Kiểm tra đánh giá hiện tại và biện pháp ưu tiên trước."
  ],
  "보완할 점": [
    "Improvements",
    "Điểm cần cải thiện"
  ],
  "시나리오별 평가": [
    "Assessment by scenario",
    "Đánh giá theo kịch bản"
  ],
  "출발 가속·급정거·급회전을 모두 실행한 결과인지 확인하세요.": [
    "Check that acceleration, sudden braking and sharp turning have all been run.",
    "Kiểm tra đã chạy đủ tăng tốc, phanh gấp và rẽ gấp."
  ],
  "관성 시나리오별 평가표": [
    "Inertia scenario assessment table",
    "Bảng đánh giá kịch bản quán tính"
  ],
  "관성 조건": [
    "Inertia conditions",
    "Điều kiện quán tính"
  ],
  "평가 내용": [
    "Assessment details",
    "Chi tiết đánh giá"
  ],
  "보완 후 재시험 체크": [
    "Post-improvement retest checklist",
    "Danh sách kiểm tra lại sau cải thiện"
  ],
  "보완 전후 수치를 대조한 뒤 검토 담당자가 확인하세요.": [
    "Compare values before and after improvements, then have the reviewer confirm.",
    "Đối chiếu số liệu trước và sau cải thiện, rồi để người xem xét xác nhận."
  ],
  "작업지시서는 3개 시나리오가 모두 실행되고 위험 판정이 없을 때 생성할 수 있습니다. 보완 권장 단계는 내부 PASS 기준을 일부 초과했지만 위험 기준 이내이므로 권장사항이 작업지시서에 함께 표시됩니다. 실제 운송 안전 판정은 차량, 노면, 화물 고정장치, 포장재 강도, 마찰계수 및 회사/법규 기준을 별도로 적용해야 합니다.": [
    "A work order can be generated when all three scenarios have run and none is rated dangerous. The improvements-recommended grade exceeds some internal PASS thresholds but remains within danger limits, so recommendations are included in the work order. Actual transport safety assessment must separately apply vehicle, road, securing-device, packaging-strength, friction and company/legal standards.",
    "Có thể tạo phiếu công việc khi đã chạy đủ ba kịch bản và không có đánh giá nguy hiểm. Mức khuyến nghị cải thiện vượt một số ngưỡng PASS nội bộ nhưng vẫn trong giới hạn nguy hiểm, nên khuyến nghị được ghi trong phiếu. Đánh giá an toàn vận chuyển thực tế phải áp dụng riêng tiêu chuẩn về xe, đường, thiết bị cố định, độ bền bao bì, ma sát và quy định công ty/pháp luật."
  ],
  "/ 3 실행": [
    "/ 3 run",
    "/ 3 đã chạy"
  ],
  "· 내부 비교 결과": [
    "· Internal comparison results",
    "· Kết quả so sánh nội bộ"
  ],
  "박스 재확인 위치 표": [
    "Box recheck positions table",
    "Bảng vị trí thùng cần kiểm tra lại"
  ],
  "주의 또는 불안정 박스가 없습니다.": [
    "No caution or unstable boxes.",
    "Không có thùng cần chú ý hoặc không ổn định."
  ],
  "팔레트/지지체 재확인 ·": [
    "Pallet/support recheck ·",
    "Kiểm tra lại pallet/đế đỡ ·"
  ],
  "시나리오별 물리 검증 결과": [
    "Physics validation results by scenario",
    "Kết quả kiểm chứng vật lý theo kịch bản"
  ],
  "조건": [
    "Condition",
    "Điều kiện"
  ],
  "점수": [
    "Score",
    "Điểm"
  ],
  "박스 판정": [
    "Box assessment",
    "Đánh giá thùng"
  ],
  "팔레트 판정": [
    "Pallet assessment",
    "Đánh giá pallet"
  ],
  " · 미실행 시나리오는 평가에 포함되지 않았습니다.": [
    " · Unrun scenarios were not included in this assessment.",
    " · Kịch bản chưa chạy không được tính trong đánh giá này."
  ],
  "팔레트 지지체 재확인 표": [
    "Pallet support recheck table",
    "Bảng kiểm tra lại đế đỡ pallet"
  ],
  "주의 또는 불안정 팔레트가 없습니다.": [
    "No caution or unstable pallets.",
    "Không có pallet cần chú ý hoặc không ổn định."
  ],
  "점검할 항목을 선택해 실행하세요.": [
    "Select an inspection and run it.",
    "Chọn hạng mục kiểm tra và chạy."
  ],
  "입력 또는 적재 결과가 변경되어 이전 점검을 폐기했습니다. 현재 결과로 다시 실행하세요.": [
    "Inputs or loading results changed, so previous inspections were discarded. Run again for the current result.",
    "Đầu vào hoặc kết quả xếp hàng đã thay đổi nên kiểm tra trước bị loại bỏ. Hãy chạy lại cho kết quả hiện tại."
  ],
  "계산 작업을 실행하지 못했습니다. 다시 시도하세요.": [
    "Could not run the calculation. Try again.",
    "Không thể chạy phép tính. Hãy thử lại."
  ],
  "결속 계산 조건: ": [
    "Securing calculation conditions: ",
    "Điều kiện tính cố định: "
  ],
  "점검 작업을 시작하지 못했습니다. 다시 시도하세요.": [
    "Could not start the inspection. Try again.",
    "Không thể bắt đầu kiểm tra. Hãy thử lại."
  ],
  "박스": [
    "Box",
    "Thùng"
  ],
  "급제동 0.50g": [
    "Sudden braking 0.50g",
    "Phanh gấp 0.50g"
  ],
  "진행": [
    "In progress",
    "Đang tiến hành"
  ],
  "Rapier 최종 물리검증 실행 실패": [
    "Rapier final physics validation failed",
    "Kiểm chứng vật lý cuối cùng Rapier thất bại"
  ],
  "적재 계산": [
    "Loading calculation",
    "Tính xếp hàng"
  ],
  "최종 적재 진행을 실행하세요.": [
    "Run the final loading workflow.",
    "Chạy quy trình xếp hàng cuối cùng."
  ],
  "완료": [
    "Complete",
    "Hoàn tất"
  ],
  "제약 조건": [
    "Constraints",
    "Ràng buộc"
  ],
  "실패 항목 있음": [
    "Failed checks found",
    "Có hạng mục không đạt"
  ],
  "현장 확인 항목 있음": [
    "Site checks required",
    "Cần kiểm tra hiện trường"
  ],
  "중량·충돌·높이·하중 확인": [
    "Check weight, collisions, height and loads",
    "Kiểm tra khối lượng, va chạm, chiều cao và tải"
  ],
  "적재 계산 후 검사": [
    "Check after loading calculation",
    "Kiểm tra sau khi tính xếp hàng"
  ],
  "무보강 물리 검증": [
    "Unsecured physics validation",
    "Kiểm chứng vật lý chưa gia cố"
  ],
  "Rapier 실패 · {0}": [
    "Rapier failed · {0}",
    "Rapier thất bại · {0}"
  ],
  "무보강 Rapier {0}점 · 불안정 {1}건 · {2}{3}": [
    "Unsecured Rapier {0} points · {1} unstable · {2}{3}",
    "Rapier chưa gia cố {0} điểm · {1} không ổn định · {2}{3}"
  ],
  "정지 확인": [
    "Stationary confirmed",
    "Đã xác nhận đứng yên"
  ],
  "잔류 움직임 감지": [
    "Residual movement detected",
    "Phát hiện chuyển động còn lại"
  ],
  " · 최종 보강 조건과 별도": [
    " · Separate from final securing conditions",
    " · Tách biệt với điều kiện gia cố cuối cùng"
  ],
  "최종 배치에 정적 중력·급제동·횡가속 적용": [
    "Apply static gravity, sudden braking and lateral acceleration to the final layout",
    "Áp dụng trọng lực tĩnh, phanh gấp và gia tốc ngang cho phương án cuối cùng"
  ],
  "보강 필요": [
    "Securing required",
    "Cần gia cố"
  ],
  "기준 검사 완료": [
    "Baseline check complete",
    "Kiểm tra cơ sở hoàn tất"
  ],
  "최종 보강 검증": [
    "Final secured validation",
    "Kiểm chứng gia cố cuối cùng"
  ],
  "{0} · 관성 {1}/3 · {2}": [
    "{0} · Inertia {1}/3 · {2}",
    "{0} · Quán tính {1}/3 · {2}"
  ],
  "보강 물리 4종 완료": [
    "Four secured physics scenarios complete",
    "Hoàn tất bốn kịch bản vật lý có gia cố"
  ],
  "Rapier 완료 · 관성 3종 검사 대기": [
    "Rapier complete · Awaiting three inertia checks",
    "Rapier hoàn tất · Chờ ba kiểm tra quán tính"
  ],
  "물리 검증 완료 후 실행": [
    "Run after physics validation completes",
    "Chạy sau khi hoàn tất kiểm chứng vật lý"
  ],
  "물리검증 미완료": [
    "Physics validation incomplete",
    "Kiểm chứng vật lý chưa hoàn tất"
  ],
  "작업지시서": [
    "Work order",
    "Phiếu công việc"
  ],
  "현재 보강 물리·관성 통과 · 표시된 보강자재·설치 조건 적용 필요": [
    "Current secured physics and inertia passed · Apply all listed securing materials and installation conditions",
    "Vật lý có gia cố và quán tính hiện tại đạt · Áp dụng đủ vật liệu gia cố và điều kiện lắp đặt đã ghi"
  ],
  "적재 제약 실패 · 출고 차단 · 검토용 문서만 가능": [
    "Loading constraints failed · Dispatch blocked · Review documents only",
    "Ràng buộc xếp hàng không đạt · Chặn xuất hàng · Chỉ tài liệu xem xét"
  ],
  "{0} · 출고 차단 · 검토용 문서만 가능": [
    "{0} · Dispatch blocked · Review documents only",
    "{0} · Chặn xuất hàng · Chỉ tài liệu xem xét"
  ],
  "물리검증 대기": [
    "Awaiting physics validation",
    "Chờ kiểm chứng vật lý"
  ],
  "보강 관성 PASS 미확인 · 출고 차단 · 검토용 문서만 가능": [
    "Secured inertia PASS unconfirmed · Dispatch blocked · Review documents only",
    "Chưa xác nhận PASS quán tính có gia cố · Chặn xuất hàng · Chỉ tài liệu xem xét"
  ],
  "보강 조건부 발급": [
    "Issued subject to securing conditions",
    "Phát hành với điều kiện gia cố"
  ],
  "검토용만 가능": [
    "Review only",
    "Chỉ để xem xét"
  ],
  "최종 적재안을 계산하고 있습니다.": [
    "Calculating the final loading plan.",
    "Đang tính phương án xếp hàng cuối cùng."
  ],
  "중량·충돌·높이·하중 조건을 확인합니다.": [
    "Checking weight, collision, height and load constraints.",
    "Đang kiểm tra ràng buộc khối lượng, va chạm, chiều cao và tải."
  ],
  "Rapier {0} · {1}% 실제 계산 중": [
    "Rapier {0} · {1}% actively calculating",
    "Rapier {0} · Đang tính {1}%"
  ],
  "출발 0.30g → 급정거 0.50g → 급회전 0.35g 검사 중": [
    "Testing acceleration 0.30g → sudden braking 0.50g → sharp turning 0.35g",
    "Đang kiểm tra tăng tốc 0.30g → phanh gấp 0.50g → rẽ gấp 0.35g"
  ],
  "뒤 방향 관성 0.30g": [
    "Rearward inertia 0.30g",
    "Quán tính về sau 0.30g"
  ],
  "차량이 출발할 때 화물의 이동과 기울기를 계산합니다.": [
    "Calculate cargo movement and tilt as the vehicle accelerates.",
    "Tính dịch chuyển và độ nghiêng của hàng khi xe tăng tốc."
  ],
  "앞 방향 관성 0.50g": [
    "Forward inertia 0.50g",
    "Quán tính về trước 0.50g"
  ],
  "제동 시 화물의 앞 방향 이동과 기울기를 계산합니다.": [
    "Calculate forward cargo movement and tilt under braking.",
    "Tính dịch chuyển về trước và độ nghiêng của hàng khi phanh."
  ],
  "옆 방향 관성 0.35g": [
    "Lateral inertia 0.35g",
    "Quán tính ngang 0.35g"
  ],
  "회전 시 화물의 옆 방향 이동과 기울기를 계산합니다.": [
    "Calculate lateral cargo movement and tilt when turning.",
    "Tính dịch chuyển ngang và độ nghiêng của hàng khi rẽ."
  ],
  "밴딩 {0}줄": [
    "Banding {0} straps",
    "Đai {0} dây"
  ],
  "코너가드 {0}EA": [
    "Corner guards {0}EA",
    "Nẹp góc {0}EA"
  ],
  "랩핑 {0}m": [
    "Wrapping {0}m",
    "Màng quấn {0}m"
  ],
  "블로킹 {0}EA": [
    "Blocking {0}EA",
    "Vật chèn {0}EA"
  ],
  "미끄럼방지 {0}EA": [
    "Anti-slip {0}EA",
    "Chống trượt {0}EA"
  ],
  "로드바 {0}EA": [
    "Load bars {0}EA",
    "Thanh chặn {0}EA"
  ],
  "추가 고정 없음": [
    "No additional securing",
    "Không có cố định bổ sung"
  ],
  "중력 정착": [
    "Gravity settling",
    "Ổn định dưới trọng lực"
  ],
  "관성 하중 적용": [
    "Applying inertia load",
    "Áp dụng tải quán tính"
  ],
  "잔류 움직임": [
    "Residual movement",
    "Chuyển động còn lại"
  ],
  "경계·충돌 문제가 있습니다. 배치를 수정한 후 다시 실행하세요.": [
    "Boundary or collision issues detected. Correct the layout and run again.",
    "Có vấn đề biên hoặc va chạm. Sửa bố trí rồi chạy lại."
  ],
  "검토 시나리오 입력·형상 또는 고정재 포함 시나리오 한도를 확인하세요.": [
    "Check review-scenario inputs, geometry and limits including securing materials.",
    "Kiểm tra đầu vào, hình học và giới hạn kịch bản xem xét gồm vật liệu cố định."
  ],
  "관성 애니메이션 계산에 실패했습니다. 다시 실행해 주세요.": [
    "Inertia animation calculation failed. Run again.",
    "Tính hoạt ảnh quán tính thất bại. Hãy chạy lại."
  ],
  "입력을 확인하고 다시 실행해 주세요.": [
    "Check inputs and run again.",
    "Kiểm tra đầu vào rồi chạy lại."
  ],
  "자동 적재 단계의 3D 화면에서 실행하세요.": [
    "Run this from the 3D view in the automatic loading step.",
    "Chạy từ màn hình 3D trong bước xếp hàng tự động."
  ],
  "입력 또는 적재 결과가 변경되어 이전 애니메이션을 폐기했습니다. 자동 적재 결과를 확인하고 다시 실행하세요.": [
    "Inputs or loading results changed, so the previous animation was discarded. Check automatic loading results and run again.",
    "Đầu vào hoặc kết quả xếp hàng đã đổi nên hoạt ảnh trước bị loại bỏ. Kiểm tra kết quả xếp tự động rồi chạy lại."
  ],
  "팝업이 차단되어 개선 보고서를 열지 못했습니다.": [
    "The popup was blocked; the improvement report could not be opened.",
    "Cửa sổ bật lên bị chặn; không thể mở báo cáo cải thiện."
  ],
  "계산을 취소했습니다. 결과는 저장되지 않았습니다.": [
    "Calculation cancelled. Results were not saved.",
    "Đã hủy tính toán. Kết quả không được lưu."
  ],
  "보강 정적 중력": [
    "Secured static gravity",
    "Trọng lực tĩnh có gia cố"
  ],
  "관성 검증 중 적재안 또는 보조자재 설정이 변경되어 이전 검증 결과를 폐기했습니다. 현재 적재안으로 다시 검증하세요.": [
    "The layout or loading-aid settings changed during inertia validation, so the previous result was discarded. Validate the current layout again.",
    "Bố trí hoặc cài đặt vật liệu hỗ trợ đã đổi khi kiểm chứng quán tính nên kết quả trước bị loại bỏ. Hãy kiểm chứng lại bố trí hiện tại."
  ],
  "보강 자재 중량까지 포함하면 컨테이너 최대 허용중량을 초과합니다. 적재량 또는 보강안을 조정해야 합니다.": [
    "Including securing materials exceeds the container's maximum payload. Adjust the load quantity or securing plan.",
    "Tính cả vật liệu gia cố sẽ vượt tải trọng tối đa của container. Điều chỉnh lượng hàng hoặc phương án gia cố."
  ],
  "최대 보강까지 적용했지만 전체 이동·기울기·화물-팔레트 상대 미끄럼·팔레트 자체 이동 중 하나 이상이 내부 안정 기준을 넘었습니다. 팔레트 작업지시서 최종화에서 제한된 상위 재배치 후보를 비교할 수 있습니다.": [
    "Even with maximum securing, at least one internal limit for overall movement, tilt, cargo-to-pallet slip or pallet movement was exceeded. The pallet work-order finalization can compare a limited set of top-ranked rearrangements.",
    "Ngay cả khi gia cố tối đa, ít nhất một giới hạn nội bộ về dịch chuyển tổng thể, độ nghiêng, trượt hàng-pallet hoặc dịch chuyển pallet vẫn bị vượt. Khi hoàn thiện phiếu pallet có thể so sánh số lượng giới hạn phương án xếp lại tốt nhất."
  ],
  "보강 자재 중량을 포함하는 안전한 적재량 조정안을 만들지 못했습니다. 적재량 또는 보강안을 변경한 뒤 다시 검사하세요.": [
    "Could not create a safe load adjustment including securing-material weight. Change the load quantity or securing plan and check again.",
    "Không thể tạo điều chỉnh tải an toàn gồm khối lượng vật liệu gia cố. Đổi lượng hàng hoặc phương án gia cố rồi kiểm tra lại."
  ],
  "추가 배치 계산 시간 제한에 도달했습니다. 현재 적재안은 관성 기준을 통과하지 못했습니다. 적재량 또는 화물 조건을 조정한 뒤 다시 검증하세요.": [
    "The additional-layout calculation time limit was reached. The current layout has not passed inertia criteria. Adjust load quantity or cargo conditions and validate again.",
    "Đã hết thời gian tính phương án bổ sung. Phương án hiện tại chưa đạt tiêu chí quán tính. Điều chỉnh lượng hàng hoặc điều kiện hàng rồi kiểm chứng lại."
  ],
  "보강재만으로 통과하지 못했고, 같은 화물 수량을 유지하면서 만들 수 있는 추가 고유 재배치안이 없습니다. 적재량 또는 화물 조건을 조정해야 합니다.": [
    "Securing alone did not achieve a pass, and no further unique rearrangements preserving cargo quantity are available. Adjust load quantity or cargo conditions.",
    "Chỉ gia cố chưa đạt và không còn phương án xếp lại riêng biệt giữ nguyên số lượng hàng. Cần điều chỉnh lượng hàng hoặc điều kiện hàng."
  ],
  "현재 적재안": [
    "Current loading plan",
    "Phương án xếp hàng hiện tại"
  ],
  "보강재 중량 확보를 위한 적재량 조정: 기존 적재 화물 {0}개를 미적재 수량에 포함했습니다. 출하 수량을 확인하세요.": [
    "Load adjusted to allow securing-material weight: {0} previously loaded items were moved to the unshipped quantity. Check shipment quantities.",
    "Điều chỉnh tải để dành khối lượng gia cố: {0} kiện đã xếp được chuyển vào số lượng chưa xếp. Kiểm tra số lượng xuất hàng."
  ],
  "기본 적재안이 관성 3종을 통과하지 못해 안전성이 높은 상위 재배치 {0}개를 추가 비교했습니다. PASS에는 도달하지 못해 가장 안전한 후보를 적용했습니다. 적재량·박스 적층조건 또는 보조자재 조건을 조정한 뒤 다시 검증하세요.": [
    "The baseline failed the three inertia scenarios, so {0} top-ranked safer rearrangements were compared. None reached PASS; the safest candidate was applied. Adjust load quantity, box stacking conditions or loading-aid settings and validate again.",
    "Phương án cơ sở không đạt ba kịch bản quán tính nên đã so sánh thêm {0} phương án an toàn cao nhất. Không phương án nào đạt PASS; phương án an toàn nhất đã được áp dụng. Điều chỉnh lượng hàng, điều kiện chồng thùng hoặc vật liệu hỗ trợ rồi kiểm chứng lại."
  ],
  "자동 재배치 후보를 평가하지 못했습니다. 적재안을 수정한 뒤 다시 실행하세요.": [
    "Could not evaluate automatic rearrangement candidates. Edit the loading plan and run again.",
    "Không thể đánh giá phương án xếp lại tự động. Sửa phương án xếp hàng rồi chạy lại."
  ],
  "최종 관성 검증 또는 자동 재배치를 완료하지 못했습니다. 현재 적재안을 유지한 채 다시 실행할 수 있습니다.": [
    "Could not finish final inertia validation or automatic rearrangement. You can retry while keeping the current layout.",
    "Không thể hoàn tất kiểm chứng quán tính cuối cùng hoặc xếp lại tự động. Có thể thử lại và giữ nguyên bố trí hiện tại."
  ],
  "관성 검증할 적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.": [
    "No loading result is available for inertia validation. Run automatic loading first.",
    "Chưa có kết quả xếp hàng để kiểm chứng quán tính. Chạy xếp hàng tự động trước."
  ],
  "적재안이 변경되었습니다. 현재 적재안으로 다시 실행하세요.": [
    "The loading plan changed. Run again for the current plan.",
    "Phương án xếp hàng đã thay đổi. Hãy chạy lại cho phương án hiện tại."
  ],
  "검사 완료": [
    "Inspection complete",
    "Kiểm tra hoàn tất"
  ],
  "팝업이 차단되었습니다. 아래 작업지시서 열기를 누르면 재계산 없이 열 수 있습니다.": [
    "The popup was blocked. Use Open work order below to open it without recalculation.",
    "Cửa sổ bật lên bị chặn. Dùng nút Mở phiếu công việc bên dưới để mở mà không tính lại."
  ],
  "사용자가 선택한 적재안을 유지하고 관성 3종을 검증합니다.": [
    "Keep the user-selected layout and validate all three inertia scenarios.",
    "Giữ phương án người dùng chọn và kiểm chứng cả ba kịch bản quán tính."
  ],
  "최종 적재 진행 · 관성 3종과 안전 후보를 자동 검증합니다.": [
    "Final loading workflow · Automatically validate three inertia scenarios and safe candidates.",
    "Quy trình xếp hàng cuối cùng · Tự động kiểm chứng ba kịch bản quán tính và các phương án an toàn."
  ],
  "현재 적재안과 안전성이 높은 소수 재배치 후보를 관성 검증합니다.": [
    "Validate inertia for the current layout and a small set of safer rearrangement candidates.",
    "Kiểm chứng quán tính cho bố trí hiện tại và một số ít phương án xếp lại an toàn hơn."
  ],
  "적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.": [
    "No loading results. Run automatic loading first.",
    "Chưa có kết quả xếp hàng. Chạy xếp hàng tự động trước."
  ],
  "반복 최적화 중 적재안이 변경되어 중단했습니다. 현재 적재안으로 다시 실행하세요.": [
    "The layout changed during optimization, so processing stopped. Run again for the current layout.",
    "Bố trí đã đổi trong khi tối ưu nên xử lý dừng lại. Hãy chạy lại cho bố trí hiện tại."
  ],
  "최종 적재 자동검증": [
    "Automatic final-load validation",
    "Tự động kiểm chứng tải cuối cùng"
  ],
  "상자 재배치": [
    "Box rearrangement",
    "Xếp lại thùng"
  ],
  "사용자가 선택한 적재안을 유지한 채 관성 검증했습니다.": [
    "Inertia was validated while preserving the user-selected layout.",
    "Đã kiểm chứng quán tính và giữ nguyên phương án người dùng chọn."
  ],
  "보강재 중량을 확보하는 적재량 조정안을 계산 중입니다.": [
    "Calculating a load adjustment to allow securing-material weight.",
    "Đang tính điều chỉnh tải để dành khối lượng cho vật liệu gia cố."
  ],
  "보강재 중량을 확보하기 위해 적재량을 조정했습니다. 기존 적재 화물 {0}개는 미적재 수량에 포함되며 출하 수량을 확인해야 합니다.": [
    "Load quantity was adjusted to allow securing-material weight. {0} previously loaded items are included in the unloaded quantity; shipment quantities must be checked.",
    "Đã điều chỉnh lượng hàng để dành khối lượng gia cố. {0} kiện đã xếp được tính vào số chưa xếp; cần kiểm tra số lượng xuất hàng."
  ],
  "대량 적재(박스 {0}개)라 대체 배치 비교를 생략하고 현재 적재안만 관성 검증했습니다.": [
    "For this large load ({0} boxes), alternative-layout comparisons were skipped and only the current layout was inertia-validated.",
    "Với tải lớn này ({0} thùng), đã bỏ qua so sánh bố trí thay thế và chỉ kiểm chứng quán tính bố trí hiện tại."
  ],
  "대량 적재(박스 {0}개)라 대체 배치는 최대 {1}개만 비교했습니다.": [
    "For this large load ({0} boxes), at most {1} alternative layouts were compared.",
    "Với tải lớn này ({0} thùng), chỉ so sánh tối đa {1} bố trí thay thế."
  ],
  "동일 수량을 유지하는 안전 재배치 후보를 계산 중입니다.": [
    "Calculating safe rearrangements that preserve the same cargo quantity.",
    "Đang tính phương án xếp lại an toàn giữ nguyên số lượng hàng."
  ],
  "추가 배치 계산 시간 제한에 도달했습니다. 계산과 검증이 완료된 배치만 비교했으며 모든 후보를 탐색한 결과는 아닙니다.": [
    "The additional-layout time limit was reached. Only fully calculated and validated layouts were compared; the search did not cover every candidate.",
    "Đã hết thời gian tính phương án bổ sung. Chỉ so sánh bố trí đã tính và kiểm chứng xong; chưa tìm hết mọi phương án."
  ],
  "관성 결과를 만들지 못했습니다. 현재 적재안을 유지합니다.": [
    "Could not produce inertia results. The current layout is retained.",
    "Không tạo được kết quả quán tính. Giữ nguyên bố trí hiện tại."
  ],
  "직접 적재 관성 검증을 완료하지 못했습니다. 현재 적재안을 유지합니다.": [
    "Could not complete direct-loading inertia validation. The current layout is retained.",
    "Không hoàn tất kiểm chứng quán tính xếp trực tiếp. Giữ nguyên bố trí hiện tại."
  ],
  "관성 검사 중": [
    "Inertia check running",
    "Đang kiểm tra quán tính"
  ],
  "비교 완료": [
    "Comparison complete",
    "So sánh hoàn tất"
  ],
  "현재 팔레트 배치와 안전성이 높은 소수 후보를 관성 검증합니다.": [
    "Validate inertia for the current pallet layout and a small set of safer candidates.",
    "Kiểm chứng quán tính cho bố trí pallet hiện tại và một số ít phương án an toàn hơn."
  ],
  "현재 팔레트 적재 결과를 찾지 못했습니다. 팔레트 최적 적재를 먼저 실행하세요.": [
    "Current pallet loading results were not found. Run optimal pallet loading first.",
    "Không tìm thấy kết quả xếp pallet hiện tại. Chạy xếp pallet tối ưu trước."
  ],
  "반복 최적화 중 적재안이 변경되어 중단했습니다. 현재 적재안으로 작업지시서를 다시 실행하세요.": [
    "The layout changed during optimization, so processing stopped. Run the work-order workflow again for the current layout.",
    "Bố trí đã đổi trong khi tối ưu nên xử lý dừng lại. Chạy lại quy trình phiếu công việc cho bố trí hiện tại."
  ],
  "작업지시서 후보 {0}/{1} · {2}": [
    "Work-order candidate {0}/{1} · {2}",
    "Phương án phiếu công việc {0}/{1} · {2}"
  ],
  "작업지시서 {0} · {1}": [
    "Work order {0} · {1}",
    "Phiếu công việc {0} · {1}"
  ],
  "브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.": [
    "The browser blocked the work-order popup. Allow popups and run again.",
    "Trình duyệt đã chặn cửa sổ phiếu công việc. Cho phép cửa sổ bật lên rồi chạy lại."
  ],
  "관성 결과를 만들지 못했습니다. 현재 팔레트 적재안을 유지합니다.": [
    "Could not produce inertia results. The current pallet layout is retained.",
    "Không tạo được kết quả quán tính. Giữ nguyên bố trí pallet hiện tại."
  ],
  "후보 비교 완료 · {0} · 검토용 작업지시서 · {1}": [
    "Candidate comparison complete · {0} · Review work order · {1}",
    "So sánh phương án hoàn tất · {0} · Phiếu công việc để xem xét · {1}"
  ],
  "팔레트 관성 검증을 완료하지 못했습니다. 현재 적재안을 유지합니다.": [
    "Could not finish pallet inertia validation. The current layout is retained.",
    "Không hoàn tất kiểm chứng quán tính pallet. Giữ nguyên bố trí hiện tại."
  ],
  "매우 안정": [
    "Very stable",
    "Rất ổn định"
  ],
  "재배치 필요": [
    "Rearrangement required",
    "Cần xếp lại"
  ],
  "박스 적재 결과가 변경되었습니다. 물리 검증을 다시 실행하세요.": [
    "Box loading results changed. Run physics validation again.",
    "Kết quả xếp thùng đã đổi. Chạy lại kiểm chứng vật lý."
  ],
  "팔레트 적재 결과가 변경되었습니다. 물리 검증을 다시 실행하세요.": [
    "Pallet loading results changed. Run physics validation again.",
    "Kết quả xếp pallet đã đổi. Chạy lại kiểm chứng vật lý."
  ],
  "적재 모드가 변경되었습니다. 물리 검증을 다시 실행하세요.": [
    "Loading mode changed. Run physics validation again.",
    "Chế độ xếp hàng đã đổi. Chạy lại kiểm chứng vật lý."
  ],
  "먼저 자동 적재를 실행해 적재 결과를 만들어 주세요.": [
    "Run automatic loading first to create a loading result.",
    "Chạy xếp hàng tự động trước để tạo kết quả."
  ],
  "현재 물리 검증할 적재물이 없습니다.": [
    "There is currently no cargo to validate physically.",
    "Hiện không có hàng để kiểm chứng vật lý."
  ],
  "검토 시나리오 입력·형상·선택 한도를 확인하세요.": [
    "Check review-scenario inputs, geometry and selected limits.",
    "Kiểm tra đầu vào, hình học và giới hạn đã chọn cho kịch bản xem xét."
  ],
  "Rapier 3D 물리 월드를 준비하고 있습니다.": [
    "Preparing the Rapier 3D physics world.",
    "Đang chuẩn bị thế giới vật lý Rapier 3D."
  ],
  "입력 또는 검토 한도가 변경되어 이전 물리 결과를 폐기했습니다.": [
    "Inputs or review limits changed, so the previous physics result was discarded.",
    "Đầu vào hoặc giới hạn xem xét đã đổi nên kết quả vật lý trước bị loại bỏ."
  ],
  "물리엔진을 실행하지 못했습니다. 브라우저를 새로고침한 뒤 다시 시도하세요.": [
    "Could not run the physics engine. Refresh the browser and try again.",
    "Không chạy được bộ máy vật lý. Làm mới trình duyệt rồi thử lại."
  ],
  "팝업이 차단되어 물리 리포트를 열지 못했습니다.": [
    "The popup was blocked; the physics report could not be opened.",
    "Cửa sổ bật lên bị chặn; không thể mở báo cáo vật lý."
  ],
  "랩핑 필름": [
    "Wrapping film",
    "Màng quấn"
  ],
  "메움 에어백": [
    "Void-fill airbag",
    "Túi khí chèn"
  ],
  "에어백 기준 면적": [
    "Airbag reference area",
    "Diện tích chuẩn túi khí"
  ],
  "에어백 최소 틈": [
    "Airbag minimum gap",
    "Khe tối thiểu túi khí"
  ],
  "에어백 최대 틈": [
    "Airbag maximum gap",
    "Khe tối đa túi khí"
  ],
  "종이 허니컴 밀도": [
    "Paper honeycomb density",
    "Khối lượng riêng giấy tổ ong"
  ],
  "허니컴 계획 모듈": [
    "Honeycomb planning module",
    "Mô-đun lập kế hoạch tổ ong"
  ],
  "허니컴 최소 틈": [
    "Honeycomb minimum gap",
    "Khe tối thiểu tổ ong"
  ],
  "허니컴 최대 틈": [
    "Honeycomb maximum gap",
    "Khe tối đa tổ ong"
  ],
  "문쪽 로드바": [
    "Door-side load bar",
    "Thanh chặn phía cửa"
  ],
  "문쪽 로드바 최소 폭": [
    "Door-side load bar minimum span",
    "Nhịp tối thiểu thanh chặn phía cửa"
  ],
  "문쪽 로드바 최대 폭": [
    "Door-side load bar maximum span",
    "Nhịp tối đa thanh chặn phía cửa"
  ],
  "로드바 계획 높이 간격": [
    "Load bar planned vertical spacing",
    "Khoảng cách đứng dự kiến giữa thanh chặn"
  ],
  " · 위험": [
    " · Danger",
    " · Nguy hiểm"
  ],
  " · 검증 미완료": [
    " · Validation incomplete",
    " · Kiểm chứng chưa hoàn tất"
  ],
  "주의 · 검토용": [
    "Caution · Review only",
    "Chú ý · Chỉ để xem xét"
  ],
  " · 적재 제약 실패": [
    " · Loading constraints failed",
    " · Ràng buộc xếp hàng không đạt"
  ],
  " · 내부 기준 초과": [
    " · Internal criteria exceeded",
    " · Vượt tiêu chí nội bộ"
  ],
  "적재 제약 실패": [
    "Loading constraints failed",
    "Ràng buộc xếp hàng không đạt"
  ],
  "물리검증 실패 · 출고 차단": [
    "Physics validation failed · Dispatch blocked",
    "Kiểm chứng vật lý không đạt · Chặn xuất hàng"
  ],
  "물리검증 미완료 · 출고 차단": [
    "Physics validation incomplete · Dispatch blocked",
    "Kiểm chứng vật lý chưa hoàn tất · Chặn xuất hàng"
  ],
  "보강 자재를 포함한 총중량이 장비 허용중량을 초과했습니다. 보강재 추가중량 {0} kg을 포함해 적재량을 줄이고 다시 검증하세요. 이 문서는 검토용이며 출고 승인으로 사용할 수 없습니다.": [
    "Total weight including securing materials exceeds the equipment payload limit. Reduce cargo quantity accounting for {0} kg of added securing materials and validate again. This document is for review and cannot authorize dispatch.",
    "Tổng khối lượng gồm vật liệu gia cố vượt tải trọng cho phép của thiết bị. Giảm lượng hàng, tính cả {0} kg gia cố bổ sung rồi kiểm chứng lại. Tài liệu này chỉ để xem xét, không cho phép xuất hàng."
  ],
  "관성 결과가 위험 기준을 초과했습니다. 작업지시서는 현장 참고용으로 발급되며 출고 전 재배치·고정 보강과 책임자 확인이 필요합니다.": [
    "Inertia results exceed danger thresholds. This work order is for site reference; rearrangement, stronger securing and supervisor confirmation are required before dispatch.",
    "Kết quả quán tính vượt ngưỡng nguy hiểm. Phiếu này chỉ để tham khảo tại hiện trường; cần xếp lại, tăng gia cố và người phụ trách xác nhận trước xuất hàng."
  ],
  "관성 3종 검증이 모두 끝나지 않았습니다. 작업지시서는 현재 적재 결과 기준으로 발급되며 미검증 항목을 현장에서 추가 확인하세요.": [
    "All three inertia validations have not completed. This work order reflects the current layout; check unvalidated items additionally on site.",
    "Chưa hoàn tất cả ba kiểm chứng quán tính. Phiếu phản ánh bố trí hiện tại; cần kiểm tra thêm các mục chưa kiểm chứng tại hiện trường."
  ],
  "내부 기준 이내의 계산 결과도 WHAT-IF 검토용으로 유지됩니다. 시나리오 한도 선택은 실제 장비 정격 변경이나 출고 승인이 아닙니다.": [
    "Results within internal criteria still remain WHAT-IF review outputs. Selecting scenario limits does not change actual equipment ratings or approve dispatch.",
    "Kết quả trong tiêu chí nội bộ vẫn chỉ để xem xét WHAT-IF. Chọn giới hạn kịch bản không thay đổi định mức thiết bị thực hay phê duyệt xuất hàng."
  ],
  "내부 PASS 기준을 일부 초과했지만 위험 기준 이내입니다. 이 문서는 검토용이며 출고 승인을 의미하지 않습니다. 아래 보완사항을 적용하고 출고 전 현장 흔들림·간섭 상태를 재확인하세요.": [
    "Some internal PASS thresholds are exceeded, but danger limits are not. This is a review document, not dispatch approval. Apply the improvements below and recheck movement and interference on site before dispatch.",
    "Một số ngưỡng PASS nội bộ bị vượt nhưng chưa vượt giới hạn nguy hiểm. Đây là tài liệu xem xét, không phải phê duyệt xuất hàng. Áp dụng cải thiện bên dưới và kiểm tra lại rung lắc, vướng chạm tại hiện trường trước xuất hàng."
  ],
  "관성 3종 내부 PASS 조건을 충족했습니다. 작업지시서에 표시된 보강자재 수량과 설치 위치를 그대로 적용하세요.": [
    "All three internal inertia PASS criteria are met. Apply exactly the securing-material quantities and installation positions shown in the work order.",
    "Đã đáp ứng tiêu chí PASS nội bộ của cả ba kịch bản quán tính. Áp dụng đúng số lượng vật liệu gia cố và vị trí lắp ghi trong phiếu."
  ],
  "수평 이동이 내부 PASS 기준보다 큽니다. 미끄럼방지재와 빈 공간 블로킹 상태를 강화하고 화물 사이 유격을 줄이세요.": [
    "Horizontal movement exceeds the internal PASS criterion. Strengthen anti-slip and void blocking, and reduce gaps between cargo.",
    "Dịch chuyển ngang vượt tiêu chí PASS nội bộ. Tăng chống trượt và chèn khoảng trống, giảm khe giữa hàng."
  ],
  "기울기가 내부 PASS 기준보다 큽니다. 높은 적층을 낮추고 무거운 화물을 하부에 유지해 무게중심을 낮추세요.": [
    "Tilt exceeds the internal PASS criterion. Lower tall stacks and keep heavy cargo low to reduce the center of gravity.",
    "Độ nghiêng vượt tiêu chí PASS nội bộ. Giảm chồng cao và giữ hàng nặng dưới thấp để hạ trọng tâm."
  ],
  "화물-팔레트 상대 미끄럼이 내부 PASS 기준보다 큽니다. 밴딩·랩핑·미끄럼방지재가 화물과 팔레트를 함께 구속하는지 확인하세요.": [
    "Cargo-to-pallet relative slip exceeds the internal PASS criterion. Check that banding, wrapping and anti-slip materials restrain cargo and pallet together.",
    "Trượt tương đối hàng-pallet vượt tiêu chí PASS nội bộ. Kiểm tra đai, màng quấn và vật liệu chống trượt giữ hàng cùng pallet."
  ],
  "팔레트 자체 이동이 내부 PASS 기준보다 큽니다. 바닥 접촉면과 고정바/블로킹 위치를 확인하고 팔레트 이동 여유를 줄이세요.": [
    "Pallet movement exceeds the internal PASS criterion. Check floor contact and load-bar/blocking positions, and reduce pallet movement clearance.",
    "Dịch chuyển pallet vượt tiêu chí PASS nội bộ. Kiểm tra tiếp xúc sàn, vị trí thanh chặn/vật chèn và giảm khoảng hở cho pallet dịch chuyển."
  ],
  "{0} 보완: 출발 시 뒤쪽으로 밀리지 않도록 후방 지지·블로킹 상태를 확인하세요.": [
    "{0} improvement: Check rear support and blocking to prevent rearward sliding during acceleration.",
    "Cải thiện {0}: Kiểm tra đỡ và chèn phía sau để ngăn trượt về sau khi tăng tốc."
  ],
  "{0} 보완: 급제동 시 앞쪽으로 밀리지 않도록 전방 지지와 문쪽 끝단의 유격을 확인하세요.": [
    "{0} improvement: Check front support and door-end gaps to prevent forward sliding during sudden braking.",
    "Cải thiện {0}: Kiểm tra đỡ phía trước và khe đầu cửa để ngăn trượt về trước khi phanh gấp."
  ],
  "{0} 보완: 좌우 측벽 유격과 좌우 중량 편차를 줄이고 상단 편중을 피하세요.": [
    "{0} improvement: Reduce sidewall gaps and lateral weight imbalance, and avoid top-heavy loading.",
    "Cải thiện {0}: Giảm khe thành bên và lệch khối lượng trái/phải, tránh dồn tải phía trên."
  ],
  "실제 출고 전 차량/컨테이너 제원, 포장재 강도, 결박장치 정격, 마찰 상태와 회사 현장 기준을 최종 확인하세요.": [
    "Before actual dispatch, confirm vehicle/container specifications, packaging strength, securing-device ratings, friction and company site standards.",
    "Trước xuất hàng thực tế, xác nhận thông số xe/container, độ bền bao bì, định mức thiết bị chằng buộc, ma sát và tiêu chuẩn hiện trường công ty."
  ],
  "{0} 출력은 현재 차단되어 있습니다.\n\n검증 결과가 없거나 최신 적재안과 일치하지 않습니다. 현재 적재안으로 다시 검사하세요.": [
    "{0} output is currently blocked.\n\nValidation results are missing or do not match the latest layout. Recheck the current layout.",
    "Hiện chặn xuất {0}.\n\nThiếu kết quả kiểm chứng hoặc không khớp bố trí mới nhất. Hãy kiểm tra lại bố trí hiện tại."
  ],
  "Rapier 엔진으로 출발 0.30g · 급제동 0.50g · 급회전 0.35g를 계산합니다.": [
    "Use Rapier to calculate acceleration 0.30g, sudden braking 0.50g and sharp turning 0.35g.",
    "Dùng Rapier tính tăng tốc 0.30g, phanh gấp 0.50g và rẽ gấp 0.35g."
  ],
  "팔레트 {0}": [
    "Pallet {0}",
    "Pallet {0}"
  ],
  "치수·좌표·중량 입력이 유효하지 않습니다. 입력을 확인하고 다시 적재하세요.": [
    "Invalid dimensions, coordinates or weight. Check inputs and reload.",
    "Kích thước, tọa độ hoặc khối lượng không hợp lệ. Kiểm tra đầu vào rồi xếp lại."
  ],
  "무게중심 X {0} · Y {1} · Z {2} m": [
    "Center of gravity X {0} · Y {1} · Z {2} m",
    "Trọng tâm X {0} · Y {1} · Z {2} m"
  ],
  "적재 중량 {0} / {1} kg": [
    "Loaded weight {0} / {1} kg",
    "Khối lượng đã xếp {0} / {1} kg"
  ],
  "최대 선하중 {0} kg/m": [
    "Maximum line load {0} kg/m",
    "Tải tuyến tính tối đa {0} kg/m"
  ],
  "기존 면하중 {0} kg/m²": [
    "Existing area load {0} kg/m²",
    "Tải diện tích hiện tại {0} kg/m²"
  ],
  "A 규칙 점검: 위반 발견": [
    "A-rule check: violations found",
    "Kiểm tra quy tắc A: phát hiện vi phạm"
  ],
  "A 규칙 점검 완료": [
    "A-rule check complete",
    "Kiểm tra quy tắc A hoàn tất"
  ],
  "선택한 항목에서 위반이 발견되지 않았습니다.": [
    "No violations found for the selected item.",
    "Không phát hiện vi phạm ở mục đã chọn."
  ],
  "A 대표값에 따른 계산입니다. 입력 없는 검사는 미실행이며 운송 안전 인증이 아닙니다.": [
    "Calculated using A reference values. Checks without inputs are not run; this is not transport safety certification.",
    "Tính theo giá trị đại diện A. Kiểm tra không có đầu vào chưa được chạy; đây không phải chứng nhận an toàn vận chuyển."
  ],
  "경계·충돌 문제 {0}건": [
    "Boundary/collision issues: {0}",
    "Vấn đề biên/va chạm: {0}"
  ],
  "경계·충돌 문제 미발견": [
    "No boundary/collision issues found",
    "Không phát hiện vấn đề biên/va chạm"
  ],
  "나머지 {0}건은 표시 생략": [
    "Remaining {0} issues omitted from display",
    "Không hiển thị {0} vấn đề còn lại"
  ],
  "직육면체 배치 기준입니다. 지지율·적층단·누적 상부하중·하역 접근성은 이 항목에서 검사하지 않습니다.": [
    "Based on rectangular placements. This check does not inspect support ratio, stack depth, cumulative top load or unloading access.",
    "Dựa trên bố trí hình hộp chữ nhật. Mục này không kiểm tra tỷ lệ đỡ, số tầng, tải tích lũy phía trên hoặc lối dỡ hàng."
  ],
  "총중량이 0이어서 무게중심을 계산할 수 없습니다.": [
    "Cannot calculate the center of gravity because total weight is zero.",
    "Không thể tính trọng tâm vì tổng khối lượng bằng không."
  ],
  "앞뒤 편차 {0}%": [
    "Longitudinal deviation {0}%",
    "Độ lệch trước-sau {0}%"
  ],
  "좌우 편차 {0}%": [
    "Lateral deviation {0}%",
    "Độ lệch trái-phải {0}%"
  ],
  "장비 높이 대비 중심 높이 {0}%": [
    "Center height relative to equipment height {0}%",
    "Chiều cao trọng tâm so với chiều cao thiết bị {0}%"
  ],
  "장비 안쪽 바닥 모서리가 원점입니다. 편차는 중심 위치 지표이며 전복 한계·축하중 검사나 운송 안전 판정이 아닙니다.": [
    "The origin is the inner floor corner. Deviations describe center position, not tipping limits, axle-load checks or transport safety assessments.",
    "Gốc tọa độ là góc sàn phía trong. Độ lệch chỉ vị trí trọng tâm, không phải giới hạn lật, kiểm tra tải trục hoặc đánh giá an toàn vận chuyển."
  ],
  "허용 적재중량 초과": [
    "Permitted payload exceeded",
    "Vượt tải trọng cho phép"
  ],
  "허용 적재중량 이내": [
    "Within permitted payload",
    "Trong tải trọng cho phép"
  ],
  "격자 평균 {0} kg/m²": [
    "Grid average {0} kg/m²",
    "Trung bình lưới {0} kg/m²"
  ],
  "격자 최대 {0} kg/m²": [
    "Grid maximum {0} kg/m²",
    "Tối đa lưới {0} kg/m²"
  ],
  "입력된 바닥 기준 {0} kg/m² · {1}": [
    "Entered floor limit {0} kg/m² · {1}",
    "Giới hạn sàn đã nhập {0} kg/m² · {1}"
  ],
  "추정치 초과": [
    "Estimate exceeds limit",
    "Ước tính vượt giới hạn"
  ],
  "추정치 이내": [
    "Estimate within limit",
    "Ước tính trong giới hạn"
  ],
  "바닥 허용하중 미입력 · 기준 비교 미실행": [
    "Floor load limit not entered · Comparison not run",
    "Chưa nhập tải sàn cho phép · Chưa chạy so sánh"
  ],
  "각 상자·팔레트 자중을 바닥에 투영한 추정치입니다. 팔레트 발의 실제 접촉압·지지 전달하중·차량 축하중은 계산하지 않습니다.": [
    "Estimated by projecting each box/pallet weight onto the floor. Actual pallet-foot contact pressure, transmitted support loads and vehicle axle loads are not calculated.",
    "Ước tính bằng cách chiếu khối lượng từng thùng/pallet xuống sàn. Không tính áp suất tiếp xúc chân pallet thực, tải truyền qua đế đỡ hoặc tải trục xe."
  ],
  "경계·충돌 문제가 있습니다. 배치를 수정한 뒤 관성 테스트를 실행하세요.": [
    "Boundary/collision issues detected. Correct the layout before running the inertia test.",
    "Phát hiện vấn đề biên/va chạm. Sửa bố trí trước khi chạy kiểm tra quán tính."
  ],
  "출발 0.30g": [
    "Acceleration 0.30g",
    "Tăng tốc 0.30g"
  ],
  "급회전 0.35g": [
    "Sharp turning 0.35g",
    "Rẽ gấp 0.35g"
  ],
  "{0} · {1}초 · 최대 수평 이동 {2} mm · 최대 기울기 {3}°": [
    "{0} · {1}s · Maximum horizontal movement {2} mm · Maximum tilt {3}°",
    "{0} · {1} giây · Dịch chuyển ngang tối đa {2} mm · Độ nghiêng tối đa {3}°"
  ],
  "관성 시나리오 3종 계산 완료": [
    "Three inertia scenarios calculated",
    "Đã tính ba kịch bản quán tính"
  ],
  "{0}. 기존 Rapier 강체·마찰·결속 모델의 계산값입니다. 실측 도로·포장 변형·고박 시공 상태를 보증하지 않으며 실제 운송 안전 인증이 아닙니다.": [
    "{0}. Calculated with the existing Rapier rigid-body, friction and restraint model. It does not guarantee actual road conditions, packaging deformation or securing installation, and is not actual transport safety certification.",
    "{0}. Tính bằng mô hình vật rắn, ma sát và giữ hiện có của Rapier. Không bảo đảm điều kiện đường thực, biến dạng bao bì hoặc thi công chằng buộc; không phải chứng nhận an toàn vận chuyển thực tế."
  ],
  "점검 계산을 완료하지 못했습니다.": [
    "Could not complete the inspection calculation.",
    "Không hoàn tất được tính toán kiểm tra."
  ],
  "상단 높이 {0}m가 설정 도달 높이 {1}m를 초과": [
    "Top height {0}m exceeds configured reach height {1}m",
    "Chiều cao đỉnh {0}m vượt chiều cao với tới đã đặt {1}m"
  ],
  "중량 {0}kg가 설정 수동 취급 기준 {1}kg를 초과": [
    "Weight {0}kg exceeds configured manual handling threshold {1}kg",
    "Khối lượng {0}kg vượt ngưỡng thao tác thủ công đã đặt {1}kg"
  ],
  "현재 보강 조건의 최종 물리검증 결과가 없습니다. 현재 적재안으로 다시 검사하세요.": [
    "No final physics validation exists for the current securing conditions. Recheck the current layout.",
    "Không có kiểm chứng vật lý cuối cùng cho điều kiện gia cố hiện tại. Kiểm tra lại bố trí hiện tại."
  ],
  "최종 물리검증이 현재 적재안·보강 조건과 일치하지 않습니다. 다시 검사하세요.": [
    "Final physics validation does not match the current layout and securing conditions. Check again.",
    "Kiểm chứng vật lý cuối cùng không khớp bố trí và gia cố hiện tại. Kiểm tra lại."
  ],
  "최종 보강 물리검증 근거가 누락되었거나 유효하지 않습니다. 4종 시나리오를 다시 검사하세요.": [
    "Final secured-physics evidence is missing or invalid. Rerun all four scenarios.",
    "Bằng chứng vật lý có gia cố cuối cùng bị thiếu hoặc không hợp lệ. Chạy lại cả bốn kịch bản."
  ],
  "최종 보강 물리검증에서 불안정 화물/지지대 {0}건이 감지되었습니다.": [
    "Final secured physics validation detected {0} unstable cargo/support items.",
    "Kiểm chứng vật lý gia cố cuối cùng phát hiện {0} mục hàng/đế đỡ không ổn định."
  ],
  "상세": [
    "detailed",
    "chi tiết"
  ],
  "최종 보강 물리검증에서 잔류 움직임이 감지되었습니다.": [
    "Final secured physics validation detected residual movement.",
    "Kiểm chứng vật lý gia cố cuối cùng phát hiện chuyển động còn lại."
  ],
  "보조 고정 없음": [
    "No auxiliary securing",
    "Không có cố định phụ trợ"
  ],
  "1차 보강 · 기본 고정": [
    "Level 1 securing · Basic restraint",
    "Gia cố cấp 1 · Cố định cơ bản"
  ],
  "2차 보강 · 강화 고정": [
    "Level 2 securing · Reinforced restraint",
    "Gia cố cấp 2 · Cố định tăng cường"
  ],
  "3차 보강 · 최대 결속": [
    "Level 3 securing · Maximum restraint",
    "Gia cố cấp 3 · Chằng buộc tối đa"
  ],
  "기본 운송 고정 · 밴딩+각대+랩핑": [
    "Basic transport securing · Banding + corner guards + wrapping",
    "Cố định vận chuyển cơ bản · Đai + nẹp góc + màng quấn"
  ],
  "2차 보강 · 강화 밴딩+각대+랩핑": [
    "Level 2 securing · Reinforced banding + corner guards + wrapping",
    "Gia cố cấp 2 · Đai tăng cường + nẹp góc + màng quấn"
  ],
  "2차 보강 · 밴딩+각대+랩핑": [
    "Level 2 securing · Banding + corner guards + wrapping",
    "Gia cố cấp 2 · Đai + nẹp góc + màng quấn"
  ],
  "3차 보강 · 고정바 포함 최대 결속": [
    "Level 3 securing · Maximum restraint including load bars",
    "Gia cố cấp 3 · Chằng buộc tối đa gồm thanh chặn"
  ],
  "기본 운송 고정 · 미끄럼방지+블로킹": [
    "Basic transport securing · Anti-slip + blocking",
    "Cố định vận chuyển cơ bản · Chống trượt + chèn"
  ],
  "2차 보강 · 블로킹+고정바": [
    "Level 2 securing · Blocking + load bars",
    "Gia cố cấp 2 · Chèn + thanh chặn"
  ],
  "3차 보강 · 최대 블로킹": [
    "Level 3 securing · Maximum blocking",
    "Gia cố cấp 3 · Chèn tối đa"
  ],
  "컨테이너 경계 이탈": [
    "Outside container bounds",
    "Ra ngoài biên container"
  ],
  "수평 이동 {0}mm": [
    "Horizontal movement {0}mm",
    "Dịch chuyển ngang {0}mm"
  ],
  "높이 변화 {0}mm": [
    "Height change {0}mm",
    "Thay đổi độ cao {0}mm"
  ],
  "기울기 {0}°": [
    "Tilt {0}°",
    "Độ nghiêng {0}°"
  ],
  "시뮬레이션 종료 시에도 움직임": [
    "Still moving at the end of simulation",
    "Vẫn chuyển động khi kết thúc mô phỏng"
  ],
  "물리적 불안정 감지": [
    "Physical instability detected",
    "Phát hiện mất ổn định vật lý"
  ],
  "미세 이동/기울기 재확인 필요": [
    "Minor movement/tilt needs rechecking",
    "Cần kiểm tra lại dịch chuyển/độ nghiêng nhỏ"
  ],
  "중력·충돌·마찰 시뮬레이션에서 안정": [
    "Stable in gravity, collision and friction simulation",
    "Ổn định trong mô phỏng trọng lực, va chạm và ma sát"
  ],
  "적재된 화물이 없어 물리 검증할 대상이 없습니다.": [
    "No loaded cargo is available for physics validation.",
    "Không có hàng đã xếp để kiểm chứng vật lý."
  ],
  "운송 종합검증에서 불안정 {0}개 · 주의 {1}개가 감지되었습니다.": [
    "Combined transport validation detected {0} unstable and {1} caution items.",
    "Kiểm chứng vận chuyển tổng hợp phát hiện {0} mục không ổn định và {1} mục cần chú ý."
  ],
  "운송 종합검증에서 {0}개 위치가 주의 수준입니다.": [
    "Combined transport validation found {0} positions requiring caution.",
    "Kiểm chứng vận chuyển tổng hợp phát hiện {0} vị trí cần chú ý."
  ],
  "정적 중력·출발 가속·급제동·횡가속 시나리오를 모두 통과했습니다.": [
    "All static gravity, acceleration, sudden braking and lateral acceleration scenarios passed.",
    "Đã đạt tất cả kịch bản trọng lực tĩnh, tăng tốc, phanh gấp và gia tốc ngang."
  ],
  "가로 {0}줄 + 세로 {1}줄 격자": [
    "Grid: {0} horizontal + {1} vertical straps",
    "Lưới: {0} dây ngang + {1} dây dọc"
  ],
  "전체 {0}": [
    "Overall {0}",
    "Tổng thể {0}"
  ],
  "화물미끄럼 {0}": [
    "Cargo slip {0}",
    "Trượt hàng {0}"
  ],
  "팔레트이동 {0}": [
    "Pallet movement {0}",
    "Dịch chuyển pallet {0}"
  ],
  "{0} 실패 · {1}": [
    "{0} failed · {1}",
    "{0} không đạt · {1}"
  ],
  "후방 관성 0.30g": [
    "Rearward inertia 0.30g",
    "Quán tính về sau 0.30g"
  ],
  "전방 관성 0.50g": [
    "Forward inertia 0.50g",
    "Quán tính về trước 0.50g"
  ],
  "측면 관성 0.35g": [
    "Lateral inertia 0.35g",
    "Quán tính ngang 0.35g"
  ],
  "최대 이동 {0}, 최대 기울기 {1}, 화물↔팔레트 {2}, 팔레트 이동 {3}로 내부 기준 이내이며 WHAT-IF 검토용입니다.": [
    "Maximum movement {0}, maximum tilt {1}, cargo↔pallet slip {2} and pallet movement {3} are within internal criteria; this is WHAT-IF review only.",
    "Dịch chuyển tối đa {0}, độ nghiêng tối đa {1}, trượt hàng↔pallet {2} và dịch chuyển pallet {3} nằm trong tiêu chí nội bộ; chỉ để xem xét WHAT-IF."
  ],
  "최대 이동 {0}, 최대 기울기 {1}로 내부 기준 이내이며 WHAT-IF 검토용입니다.": [
    "Maximum movement {0} and maximum tilt {1} are within internal criteria; this is WHAT-IF review only.",
    "Dịch chuyển tối đa {0} và độ nghiêng tối đa {1} nằm trong tiêu chí nội bộ; chỉ để xem xét WHAT-IF."
  ],
  "화물 {0}가 컨테이너 경계를 침범했습니다.": [
    "Cargo {0} crosses container bounds.",
    "Hàng {0} vượt biên container."
  ],
  "화물 {0}와 {1}가 겹칩니다.": [
    "Cargo {0} overlaps {1}.",
    "Hàng {0} chồng lấn {1}."
  ],
  "{0} / {1} kg · 허용 적재중량 초과": [
    "{0} / {1} kg · Permitted payload exceeded",
    "{0} / {1} kg · Vượt tải trọng cho phép"
  ],
  "{0} / {1} kg · 허용 적재중량 이내": [
    "{0} / {1} kg · Within permitted payload",
    "{0} / {1} kg · Trong tải trọng cho phép"
  ],
  "입력된 바닥 기준 {0} kg/m² · 추정치 초과": [
    "Entered floor limit {0} kg/m² · Estimate exceeds limit",
    "Giới hạn sàn đã nhập {0} kg/m² · Ước tính vượt giới hạn"
  ],
  "입력된 바닥 기준 {0} kg/m² · 추정치 이내": [
    "Entered floor limit {0} kg/m² · Estimate within limit",
    "Giới hạn sàn đã nhập {0} kg/m² · Ước tính trong giới hạn"
  ],
  "현재 팔레트 적재안": [
    "Current pallet loading plan",
    "Phương án xếp pallet hiện tại"
  ],
  "최대 보강재 중량 확보 · 초과 화물 미적재": [
    "Reserve maximum securing weight · Excess cargo left unloaded",
    "Dành khối lượng gia cố tối đa · Không xếp hàng vượt tải"
  ],
  "전체 높이 {0}%": [
    "Overall height {0}%",
    "Chiều cao tổng thể {0}%"
  ],
  "전체 저중심": [
    "Lower overall center of gravity",
    "Hạ trọng tâm tổng thể"
  ],
  "중량물 저층 우선": [
    "Heavy cargo in lower layers first",
    "Ưu tiên hàng nặng ở tầng thấp"
  ],
  "고형상 저층 우선": [
    "Tall cargo in lower layers first",
    "Ưu tiên hàng cao ở tầng thấp"
  ],
  "SKU 층수 분산": [
    "Spread SKU layer counts",
    "Phân tán số tầng SKU"
  ],
  "{0}단 낮춤": [
    "Lower by {0} layers",
    "Hạ {0} tầng"
  ],
  "자동 방향": [
    "Automatic orientation",
    "Hướng tự động"
  ],
  "정방향 고정": [
    "Fixed original orientation",
    "Cố định hướng gốc"
  ],
  "90도 회전 고정": [
    "Fixed 90° rotation",
    "Cố định xoay 90°"
  ],
  "SKU 교차 방향": [
    "Alternating SKU orientation",
    "Hướng SKU xen kẽ"
  ],
  "높이 {0}%": [
    "Height {0}%",
    "Chiều cao {0}%"
  ],
  "{0}단 제한": [
    "Limit {0} layers",
    "Giới hạn {0} tầng"
  ],
  "팔레트 위 재배치": [
    "Rearrange on pallets",
    "Xếp lại trên pallet"
  ],
  "안쪽 밀착 2열": [
    "Two rows packed against the inner end",
    "Hai hàng sát đầu phía trong"
  ],
  "문쪽 밀착 2열": [
    "Two rows packed against the door end",
    "Hai hàng sát đầu phía cửa"
  ],
  "최종 적재 자동검증 {0}/{1}": [
    "Automatic final-load validation {0}/{1}",
    "Tự động kiểm chứng tải cuối cùng {0}/{1}"
  ],
  "상자 재배치 {0}/{1}": [
    "Box rearrangement {0}/{1}",
    "Xếp lại thùng {0}/{1}"
  ],
  "작업지시서 후보 {0}/{1}": [
    "Work-order candidate {0}/{1}",
    "Phương án phiếu công việc {0}/{1}"
  ],
  "후보 비교 완료": [
    "Candidate comparison complete",
    "So sánh phương án hoàn tất"
  ],
  "검토용 작업지시서": [
    "Review work order",
    "Phiếu công việc để xem xét"
  ],
  "상단": [
    "Top",
    "Đỉnh"
  ],
  "작업지시서 {0}": [
    "Work order {0}",
    "Phiếu công việc {0}"
  ],
  "출발 가속 · 급정거 · 급회전과 동일한 보강 조건의 물리 4종을 검증합니다. 기본 적재안이 실패하면 DIRECT BOX는 정적 안전점수가 높은 상위 {0}개 재배치만 추가 비교해 브라우저가 장시간 멈추는 것을 방지합니다.": [
    "Validate acceleration, sudden braking, sharp turning and four physics scenarios under the same securing conditions. If the baseline fails, DIRECT BOX compares only the top {0} rearrangements ranked by static safety to avoid prolonged browser freezes.",
    "Kiểm chứng tăng tốc, phanh gấp, rẽ gấp và bốn kịch bản vật lý với cùng điều kiện gia cố. Nếu phương án cơ sở thất bại, DIRECT BOX chỉ so sánh thêm {0} phương án xếp lại có điểm an toàn tĩnh cao nhất để tránh trình duyệt bị treo lâu."
  ],
  "출발 가속 보완: 출발 시 뒤쪽으로 밀리지 않도록 후방 지지·블로킹 상태를 확인하세요.": [
    "Acceleration improvement: Check rear support and blocking to prevent rearward sliding during acceleration.",
    "Cải thiện Tăng tốc: Kiểm tra đỡ và chèn phía sau để ngăn trượt về sau khi tăng tốc."
  ],
  "급정거 보완: 급제동 시 앞쪽으로 밀리지 않도록 전방 지지와 문쪽 끝단의 유격을 확인하세요.": [
    "Sudden braking improvement: Check front support and door-end gaps to prevent forward sliding during sudden braking.",
    "Cải thiện Phanh gấp: Kiểm tra đỡ phía trước và khe đầu cửa để ngăn trượt về trước khi phanh gấp."
  ],
  "급회전 보완: 좌우 측벽 유격과 좌우 중량 편차를 줄이고 상단 편중을 피하세요.": [
    "Sharp turning improvement: Reduce sidewall gaps and lateral weight imbalance, and avoid top-heavy loading.",
    "Cải thiện Rẽ gấp: Giảm khe thành bên và lệch khối lượng trái/phải, tránh dồn tải phía trên."
  ],
  "최종 보강 물리검증에서 불안정 화물/지지대 상세건이 감지되었습니다.": [
    "Final secured physics validation detected unstable cargo/support details.",
    "Kiểm chứng vật lý gia cố cuối cùng phát hiện chi tiết hàng/đế đỡ không ổn định."
  ],
  "중복 화물 개체 ID": [
    "Duplicate cargo instance ID",
    "Trùng ID cá thể hàng"
  ],
  "화물 사양 또는 좌표가 유효하지 않습니다.": [
    "Cargo specifications or coordinates are invalid.",
    "Thông số hoặc tọa độ hàng không hợp lệ."
  ],
  "원본 치수·회전·중량 불일치": [
    "Original dimensions, rotation or weight do not match",
    "Không khớp kích thước, hướng xoay hoặc khối lượng gốc"
  ],
  "원본 수량 초과": [
    "Original quantity exceeded",
    "Vượt số lượng gốc"
  ],
  "기존 화물 적층 한도 초과": [
    "Existing cargo stacking limit exceeded",
    "Vượt giới hạn xếp chồng hiện có của hàng"
  ],
  "기존 보수적 상부하중 한도 초과": [
    "Existing conservative top-load limit exceeded",
    "Vượt giới hạn tải phía trên bảo thủ hiện có"
  ],
  "기존 바닥 면하중 한도 초과": [
    "Existing floor area-load limit exceeded",
    "Vượt giới hạn tải diện tích sàn hiện có"
  ],
  "기존 트럭 무게중심 한도 초과": [
    "Existing truck center-of-gravity limit exceeded",
    "Vượt giới hạn trọng tâm xe tải hiện có"
  ],
  "{0}: 계산상 필요 고정력 전방 {1}daN, 후방 {2}daN, 측방 {3}daN (최대 {4}daN). 실제 고정장치의 충족 여부는 별도 확인이 필요합니다.": [
    "{0}: Calculated restraint required: forward {1}daN, rearward {2}daN, lateral {3}daN (maximum {4}daN). Actual securing-device capacity must be checked separately.",
    "{0}: Lực giữ cần thiết theo tính toán: trước {1}daN, sau {2}daN, ngang {3}daN (tối đa {4}daN). Cần kiểm tra riêng khả năng đáp ứng của thiết bị cố định thực tế."
  ],
  "문 개구 정보 없음: 도어 검사 미실행": [
    "No door-opening data: door check not run",
    "Không có dữ liệu cửa mở: chưa kiểm tra cửa"
  ],
  "실제 축 제원 없음: 축하중 검사 미실행": [
    "No actual axle specifications: axle-load check not run",
    "Không có thông số trục thực: chưa kiểm tra tải trục"
  ],
  "차량 자중 없음: 차량 총중량 검사 미실행": [
    "No vehicle tare weight: gross-vehicle-weight check not run",
    "Không có tự trọng xe: chưa kiểm tra tổng khối lượng xe"
  ],
  "A 규칙에서 배치 후보를 찾지 못했습니다.": [
    "No placement candidate found under A rules.",
    "Không tìm thấy phương án bố trí theo quy tắc A."
  ],
  "{0}: 적재 공간(마진 적용)을 벗어남": [
    "{0}: Outside the loading space including margins",
    "{0}: Ra ngoài không gian xếp hàng có tính khoảng chừa"
  ],
  "{0}: 윗면 {1}mm가 허용 높이 {2}mm 초과": [
    "{0}: Top at {1}mm exceeds permitted height {2}mm",
    "{0}: Đỉnh ở {1}mm vượt chiều cao cho phép {2}mm"
  ],
  "{0}: 적재 한계선 {1}mm 초과": [
    "{0}: Exceeds loading height limit {1}mm",
    "{0}: Vượt vạch giới hạn xếp hàng {1}mm"
  ],
  "{0}: 도어 개구({1}×{2}) 통과 불가 (필요 {3}×{4})": [
    "{0}: Cannot pass through door opening ({1}×{2}); requires {3}×{4}",
    "{0}: Không qua được cửa mở ({1}×{2}); cần {3}×{4}"
  ],
  "{0}: 윗단 적재 시 도어 헤더 여유 부족. 내부에서 들어올려 적재해야 함": [
    "{0}: Insufficient door-header clearance for upper-tier loading. Lift and place inside.",
    "{0}: Không đủ khoảng hở trên cửa khi xếp tầng trên. Phải nâng và xếp ở bên trong."
  ],
  "{0}와 {1}가 겹침": [
    "{0} overlaps {1}",
    "{0} chồng lấn {1}"
  ],
  "{0}: 회전 {1}은 허용되지 않음": [
    "{0}: Rotation {1} is not allowed",
    "{0}: Không cho phép hướng xoay {1}"
  ],
  "{0}: 지지율 {1}% (기준 {2}%)": [
    "{0}: Support ratio {1}% (criterion {2}%)",
    "{0}: Tỷ lệ đỡ {1}% (tiêu chí {2}%)"
  ],
  "{0}: 무게중심이 지지 영역 밖에 있음": [
    "{0}: Center of gravity is outside the support area",
    "{0}: Trọng tâm nằm ngoài vùng đỡ"
  ],
  "{0}: 상부 하중 {1}kg이 허용 {2}kg 초과": [
    "{0}: Top load {1}kg exceeds permitted {2}kg",
    "{0}: Tải phía trên {1}kg vượt mức cho phép {2}kg"
  ],
  "{0}: 다른 화물 위에 올릴 수 없는 화물": [
    "{0}: This cargo cannot be placed on other cargo",
    "{0}: Không thể đặt hàng này lên hàng khác"
  ],
  "{0}: {1}단에 놓임 (최대 {2}단)": [
    "{0}: Placed on layer {1} (maximum {2})",
    "{0}: Đặt ở tầng {1} (tối đa {2})"
  ],
  "{0}: {1}의 면압 {2}kg/m²이 허용 {3}kg/m² 초과": [
    "{0}: Contact pressure from {1} is {2}kg/m², exceeding permitted {3}kg/m²",
    "{0}: Áp suất tiếp xúc từ {1} là {2}kg/m², vượt mức cho phép {3}kg/m²"
  ],
  "혼적 금지: {0} 그룹과 {1} 그룹이 같은 공간에 있음": [
    "Mixed loading prohibited: groups {0} and {1} share the same space",
    "Cấm xếp chung: nhóm {0} và {1} ở cùng không gian"
  ],
  "온도대가 다른 화물이 섞임: {0}": [
    "Cargo from different temperature zones is mixed: {0}",
    "Hàng thuộc các vùng nhiệt độ khác nhau bị xếp chung: {0}"
  ],
  "{0}(착지 {1}) 위에 나중에 내릴 화물이 있음": [
    "{0} (stop {1}) has later-unloading cargo above it",
    "Có hàng dỡ sau nằm trên {0} (điểm dỡ {1})"
  ],
  "{0}(착지 {1})의 반출 경로가 나중에 내릴 화물에 막힘": [
    "The unloading path of {0} (stop {1}) is blocked by later-unloading cargo",
    "Đường dỡ của {0} (điểm dỡ {1}) bị hàng dỡ sau chặn"
  ],
  "화물 총중량 {0}kg이 한도 {1}kg 초과": [
    "Total cargo weight {0}kg exceeds limit {1}kg",
    "Tổng khối lượng hàng {0}kg vượt giới hạn {1}kg"
  ],
  "X={0}mm 부근 선하중 {1}kg/m이 허용 {2}kg/m 초과. 받침목으로 분산 필요": [
    "Line load {1}kg/m near X={0}mm exceeds permitted {2}kg/m. Load-spreading timber is required.",
    "Tải tuyến tính {1}kg/m gần X={0}mm vượt mức cho phép {2}kg/m. Cần gỗ kê để phân bố tải."
  ],
  "길이 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 도어 쪽으로 쏠림": [
    "Longitudinal center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased toward the door.",
    "Lệch trọng tâm theo chiều dọc {0}mm (cho phép ±{1}mm). Dồn về phía cửa."
  ],
  "길이 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 앞벽 쪽으로 쏠림": [
    "Longitudinal center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased toward the front wall.",
    "Lệch trọng tâm theo chiều dọc {0}mm (cho phép ±{1}mm). Dồn về vách trước."
  ],
  "폭 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 우측으로 쏠림": [
    "Lateral center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased to the right.",
    "Lệch trọng tâm theo chiều ngang {0}mm (cho phép ±{1}mm). Dồn sang phải."
  ],
  "폭 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 좌측으로 쏠림": [
    "Lateral center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased to the left.",
    "Lệch trọng tâm theo chiều ngang {0}mm (cho phép ±{1}mm). Dồn sang trái."
  ],
  "무게중심 높이 {0}mm가 권장 한도 {1}mm 초과": [
    "Center-of-gravity height {0}mm exceeds recommended limit {1}mm",
    "Chiều cao trọng tâm {0}mm vượt giới hạn khuyến nghị {1}mm"
  ],
  "전축 하중 {0}kg이 허용 {1}kg 초과. 화물을 뒤로 이동": [
    "Front axle load {0}kg exceeds permitted {1}kg. Move cargo rearward.",
    "Tải trục trước {0}kg vượt mức cho phép {1}kg. Chuyển hàng về sau."
  ],
  "후축 하중 {0}kg이 허용 {1}kg 초과. 화물을 앞으로 이동": [
    "Rear axle load {0}kg exceeds permitted {1}kg. Move cargo forward.",
    "Tải trục sau {0}kg vượt mức cho phép {1}kg. Chuyển hàng về trước."
  ],
  "총중량 {0}kg이 한도 {1}kg 초과": [
    "Gross weight {0}kg exceeds limit {1}kg",
    "Tổng khối lượng {0}kg vượt giới hạn {1}kg"
  ],
  "전축 하중 비율 {0}% (최소 {1}%). 조향 불안정": [
    "Front axle load ratio {0}% (minimum {1}%). Steering instability.",
    "Tỷ lệ tải trục trước {0}% (tối thiểu {1}%). Lái không ổn định."
  ],
  "{0}: 측방 전도 위험. 블로킹 또는 래싱 필요": [
    "{0}: Risk of sideways tipping. Blocking or lashing required.",
    "{0}: Nguy cơ lật ngang. Cần chèn hoặc chằng buộc."
  ],
  "{0}: 전방 전도 위험. 블로킹 또는 래싱 필요": [
    "{0}: Risk of forward tipping. Blocking or lashing required.",
    "{0}: Nguy cơ lật về trước. Cần chèn hoặc chằng buộc."
  ],
  "뒤쪽 빈 공간 {0}mm. 각목, 에어백, 래싱으로 고정 필요": [
    "Rear void {0}mm. Secure with timber, airbags or lashing.",
    "Khoảng trống phía sau {0}mm. Cần cố định bằng gỗ, túi khí hoặc chằng buộc."
  ],
  "폭 방향 빈틈 합계 {0}mm. 에어백 등으로 채움 필요": [
    "Total lateral gap {0}mm. Fill with airbags or similar materials.",
    "Tổng khe ngang {0}mm. Cần chèn túi khí hoặc vật liệu tương tự."
  ],
  "착지 {0} 하역 후: 중복 화물 개체 ID": [
    "After unloading at stop {0}: Duplicate cargo instance ID",
    "Sau khi dỡ tại điểm {0}: Trùng ID cá thể hàng"
  ],
  "착지 {0} 하역 후: 화물 사양 또는 좌표가 유효하지 않습니다.": [
    "After unloading at stop {0}: Cargo specifications or coordinates are invalid.",
    "Sau khi dỡ tại điểm {0}: Thông số hoặc tọa độ hàng không hợp lệ."
  ],
  "착지 {0} 하역 후: 원본 치수·회전·중량 불일치": [
    "After unloading at stop {0}: Original dimensions, rotation or weight do not match",
    "Sau khi dỡ tại điểm {0}: Không khớp kích thước, hướng xoay hoặc khối lượng gốc"
  ],
  "착지 {0} 하역 후: 원본 수량 초과": [
    "After unloading at stop {0}: Original quantity exceeded",
    "Sau khi dỡ tại điểm {0}: Vượt số lượng gốc"
  ],
  "착지 {0} 하역 후: 기존 화물 적층 한도 초과": [
    "After unloading at stop {0}: Existing cargo stacking limit exceeded",
    "Sau khi dỡ tại điểm {0}: Vượt giới hạn xếp chồng hiện có của hàng"
  ],
  "착지 {0} 하역 후: 기존 보수적 상부하중 한도 초과": [
    "After unloading at stop {0}: Existing conservative top-load limit exceeded",
    "Sau khi dỡ tại điểm {0}: Vượt giới hạn tải phía trên bảo thủ hiện có"
  ],
  "착지 {0} 하역 후: 기존 바닥 면하중 한도 초과": [
    "After unloading at stop {0}: Existing floor area-load limit exceeded",
    "Sau khi dỡ tại điểm {0}: Vượt giới hạn tải diện tích sàn hiện có"
  ],
  "착지 {0} 하역 후: 기존 트럭 무게중심 한도 초과": [
    "After unloading at stop {0}: Existing truck center-of-gravity limit exceeded",
    "Sau khi dỡ tại điểm {0}: Vượt giới hạn trọng tâm xe tải hiện có"
  ],
  "착지 {5} 하역 후: {0}: 계산상 필요 고정력 전방 {1}daN, 후방 {2}daN, 측방 {3}daN (최대 {4}daN). 실제 고정장치의 충족 여부는 별도 확인이 필요합니다.": [
    "After unloading at stop {5}: {0}: Calculated restraint required: forward {1}daN, rearward {2}daN, lateral {3}daN (maximum {4}daN). Actual securing-device capacity must be checked separately.",
    "Sau khi dỡ tại điểm {5}: {0}: Lực giữ cần thiết theo tính toán: trước {1}daN, sau {2}daN, ngang {3}daN (tối đa {4}daN). Cần kiểm tra riêng khả năng đáp ứng của thiết bị cố định thực tế."
  ],
  "착지 {0} 하역 후: 문 개구 정보 없음: 도어 검사 미실행": [
    "After unloading at stop {0}: No door-opening data: door check not run",
    "Sau khi dỡ tại điểm {0}: Không có dữ liệu cửa mở: chưa kiểm tra cửa"
  ],
  "착지 {0} 하역 후: 실제 축 제원 없음: 축하중 검사 미실행": [
    "After unloading at stop {0}: No actual axle specifications: axle-load check not run",
    "Sau khi dỡ tại điểm {0}: Không có thông số trục thực: chưa kiểm tra tải trục"
  ],
  "착지 {0} 하역 후: 차량 자중 없음: 차량 총중량 검사 미실행": [
    "After unloading at stop {0}: No vehicle tare weight: gross-vehicle-weight check not run",
    "Sau khi dỡ tại điểm {0}: Không có tự trọng xe: chưa kiểm tra tổng khối lượng xe"
  ],
  "착지 {0} 하역 후: A 규칙에서 배치 후보를 찾지 못했습니다.": [
    "After unloading at stop {0}: No placement candidate found under A rules.",
    "Sau khi dỡ tại điểm {0}: Không tìm thấy phương án bố trí theo quy tắc A."
  ],
  "착지 {1} 하역 후: {0}: 적재 공간(마진 적용)을 벗어남": [
    "After unloading at stop {1}: {0}: Outside the loading space including margins",
    "Sau khi dỡ tại điểm {1}: {0}: Ra ngoài không gian xếp hàng có tính khoảng chừa"
  ],
  "착지 {3} 하역 후: {0}: 윗면 {1}mm가 허용 높이 {2}mm 초과": [
    "After unloading at stop {3}: {0}: Top at {1}mm exceeds permitted height {2}mm",
    "Sau khi dỡ tại điểm {3}: {0}: Đỉnh ở {1}mm vượt chiều cao cho phép {2}mm"
  ],
  "착지 {2} 하역 후: {0}: 적재 한계선 {1}mm 초과": [
    "After unloading at stop {2}: {0}: Exceeds loading height limit {1}mm",
    "Sau khi dỡ tại điểm {2}: {0}: Vượt vạch giới hạn xếp hàng {1}mm"
  ],
  "착지 {5} 하역 후: {0}: 도어 개구({1}×{2}) 통과 불가 (필요 {3}×{4})": [
    "After unloading at stop {5}: {0}: Cannot pass through door opening ({1}×{2}); requires {3}×{4}",
    "Sau khi dỡ tại điểm {5}: {0}: Không qua được cửa mở ({1}×{2}); cần {3}×{4}"
  ],
  "착지 {1} 하역 후: {0}: 윗단 적재 시 도어 헤더 여유 부족. 내부에서 들어올려 적재해야 함": [
    "After unloading at stop {1}: {0}: Insufficient door-header clearance for upper-tier loading. Lift and place inside.",
    "Sau khi dỡ tại điểm {1}: {0}: Không đủ khoảng hở trên cửa khi xếp tầng trên. Phải nâng và xếp ở bên trong."
  ],
  "착지 {2} 하역 후: {0}와 {1}가 겹침": [
    "After unloading at stop {2}: {0} overlaps {1}",
    "Sau khi dỡ tại điểm {2}: {0} chồng lấn {1}"
  ],
  "착지 {2} 하역 후: {0}: 회전 {1}은 허용되지 않음": [
    "After unloading at stop {2}: {0}: Rotation {1} is not allowed",
    "Sau khi dỡ tại điểm {2}: {0}: Không cho phép hướng xoay {1}"
  ],
  "착지 {3} 하역 후: {0}: 지지율 {1}% (기준 {2}%)": [
    "After unloading at stop {3}: {0}: Support ratio {1}% (criterion {2}%)",
    "Sau khi dỡ tại điểm {3}: {0}: Tỷ lệ đỡ {1}% (tiêu chí {2}%)"
  ],
  "착지 {1} 하역 후: {0}: 무게중심이 지지 영역 밖에 있음": [
    "After unloading at stop {1}: {0}: Center of gravity is outside the support area",
    "Sau khi dỡ tại điểm {1}: {0}: Trọng tâm nằm ngoài vùng đỡ"
  ],
  "착지 {3} 하역 후: {0}: 상부 하중 {1}kg이 허용 {2}kg 초과": [
    "After unloading at stop {3}: {0}: Top load {1}kg exceeds permitted {2}kg",
    "Sau khi dỡ tại điểm {3}: {0}: Tải phía trên {1}kg vượt mức cho phép {2}kg"
  ],
  "착지 {1} 하역 후: {0}: 다른 화물 위에 올릴 수 없는 화물": [
    "After unloading at stop {1}: {0}: This cargo cannot be placed on other cargo",
    "Sau khi dỡ tại điểm {1}: {0}: Không thể đặt hàng này lên hàng khác"
  ],
  "착지 {3} 하역 후: {0}: {1}단에 놓임 (최대 {2}단)": [
    "After unloading at stop {3}: {0}: Placed on layer {1} (maximum {2})",
    "Sau khi dỡ tại điểm {3}: {0}: Đặt ở tầng {1} (tối đa {2})"
  ],
  "착지 {4} 하역 후: {0}: {1}의 면압 {2}kg/m²이 허용 {3}kg/m² 초과": [
    "After unloading at stop {4}: {0}: Contact pressure from {1} is {2}kg/m², exceeding permitted {3}kg/m²",
    "Sau khi dỡ tại điểm {4}: {0}: Áp suất tiếp xúc từ {1} là {2}kg/m², vượt mức cho phép {3}kg/m²"
  ],
  "착지 {2} 하역 후: 혼적 금지: {0} 그룹과 {1} 그룹이 같은 공간에 있음": [
    "After unloading at stop {2}: Mixed loading prohibited: groups {0} and {1} share the same space",
    "Sau khi dỡ tại điểm {2}: Cấm xếp chung: nhóm {0} và {1} ở cùng không gian"
  ],
  "착지 {1} 하역 후: 온도대가 다른 화물이 섞임: {0}": [
    "After unloading at stop {1}: Cargo from different temperature zones is mixed: {0}",
    "Sau khi dỡ tại điểm {1}: Hàng thuộc các vùng nhiệt độ khác nhau bị xếp chung: {0}"
  ],
  "착지 {2} 하역 후: {0}(착지 {1}) 위에 나중에 내릴 화물이 있음": [
    "After unloading at stop {2}: {0} (stop {1}) has later-unloading cargo above it",
    "Sau khi dỡ tại điểm {2}: Có hàng dỡ sau nằm trên {0} (điểm dỡ {1})"
  ],
  "착지 {2} 하역 후: {0}(착지 {1})의 반출 경로가 나중에 내릴 화물에 막힘": [
    "After unloading at stop {2}: The unloading path of {0} (stop {1}) is blocked by later-unloading cargo",
    "Sau khi dỡ tại điểm {2}: Đường dỡ của {0} (điểm dỡ {1}) bị hàng dỡ sau chặn"
  ],
  "착지 {2} 하역 후: 화물 총중량 {0}kg이 한도 {1}kg 초과": [
    "After unloading at stop {2}: Total cargo weight {0}kg exceeds limit {1}kg",
    "Sau khi dỡ tại điểm {2}: Tổng khối lượng hàng {0}kg vượt giới hạn {1}kg"
  ],
  "착지 {3} 하역 후: X={0}mm 부근 선하중 {1}kg/m이 허용 {2}kg/m 초과. 받침목으로 분산 필요": [
    "After unloading at stop {3}: Line load {1}kg/m near X={0}mm exceeds permitted {2}kg/m. Load-spreading timber is required.",
    "Sau khi dỡ tại điểm {3}: Tải tuyến tính {1}kg/m gần X={0}mm vượt mức cho phép {2}kg/m. Cần gỗ kê để phân bố tải."
  ],
  "착지 {2} 하역 후: 길이 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 도어 쪽으로 쏠림": [
    "After unloading at stop {2}: Longitudinal center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased toward the door.",
    "Sau khi dỡ tại điểm {2}: Lệch trọng tâm theo chiều dọc {0}mm (cho phép ±{1}mm). Dồn về phía cửa."
  ],
  "착지 {2} 하역 후: 길이 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 앞벽 쪽으로 쏠림": [
    "After unloading at stop {2}: Longitudinal center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased toward the front wall.",
    "Sau khi dỡ tại điểm {2}: Lệch trọng tâm theo chiều dọc {0}mm (cho phép ±{1}mm). Dồn về vách trước."
  ],
  "착지 {2} 하역 후: 폭 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 우측으로 쏠림": [
    "After unloading at stop {2}: Lateral center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased to the right.",
    "Sau khi dỡ tại điểm {2}: Lệch trọng tâm theo chiều ngang {0}mm (cho phép ±{1}mm). Dồn sang phải."
  ],
  "착지 {2} 하역 후: 폭 방향 무게중심 편차 {0}mm (허용 ±{1}mm). 좌측으로 쏠림": [
    "After unloading at stop {2}: Lateral center-of-gravity deviation {0}mm (permitted ±{1}mm). Biased to the left.",
    "Sau khi dỡ tại điểm {2}: Lệch trọng tâm theo chiều ngang {0}mm (cho phép ±{1}mm). Dồn sang trái."
  ],
  "착지 {2} 하역 후: 무게중심 높이 {0}mm가 권장 한도 {1}mm 초과": [
    "After unloading at stop {2}: Center-of-gravity height {0}mm exceeds recommended limit {1}mm",
    "Sau khi dỡ tại điểm {2}: Chiều cao trọng tâm {0}mm vượt giới hạn khuyến nghị {1}mm"
  ],
  "착지 {2} 하역 후: 전축 하중 {0}kg이 허용 {1}kg 초과. 화물을 뒤로 이동": [
    "After unloading at stop {2}: Front axle load {0}kg exceeds permitted {1}kg. Move cargo rearward.",
    "Sau khi dỡ tại điểm {2}: Tải trục trước {0}kg vượt mức cho phép {1}kg. Chuyển hàng về sau."
  ],
  "착지 {2} 하역 후: 후축 하중 {0}kg이 허용 {1}kg 초과. 화물을 앞으로 이동": [
    "After unloading at stop {2}: Rear axle load {0}kg exceeds permitted {1}kg. Move cargo forward.",
    "Sau khi dỡ tại điểm {2}: Tải trục sau {0}kg vượt mức cho phép {1}kg. Chuyển hàng về trước."
  ],
  "착지 {2} 하역 후: 총중량 {0}kg이 한도 {1}kg 초과": [
    "After unloading at stop {2}: Gross weight {0}kg exceeds limit {1}kg",
    "Sau khi dỡ tại điểm {2}: Tổng khối lượng {0}kg vượt giới hạn {1}kg"
  ],
  "착지 {2} 하역 후: 전축 하중 비율 {0}% (최소 {1}%). 조향 불안정": [
    "After unloading at stop {2}: Front axle load ratio {0}% (minimum {1}%). Steering instability.",
    "Sau khi dỡ tại điểm {2}: Tỷ lệ tải trục trước {0}% (tối thiểu {1}%). Lái không ổn định."
  ],
  "착지 {1} 하역 후: {0}: 측방 전도 위험. 블로킹 또는 래싱 필요": [
    "After unloading at stop {1}: {0}: Risk of sideways tipping. Blocking or lashing required.",
    "Sau khi dỡ tại điểm {1}: {0}: Nguy cơ lật ngang. Cần chèn hoặc chằng buộc."
  ],
  "착지 {1} 하역 후: {0}: 전방 전도 위험. 블로킹 또는 래싱 필요": [
    "After unloading at stop {1}: {0}: Risk of forward tipping. Blocking or lashing required.",
    "Sau khi dỡ tại điểm {1}: {0}: Nguy cơ lật về trước. Cần chèn hoặc chằng buộc."
  ],
  "착지 {1} 하역 후: 뒤쪽 빈 공간 {0}mm. 각목, 에어백, 래싱으로 고정 필요": [
    "After unloading at stop {1}: Rear void {0}mm. Secure with timber, airbags or lashing.",
    "Sau khi dỡ tại điểm {1}: Khoảng trống phía sau {0}mm. Cần cố định bằng gỗ, túi khí hoặc chằng buộc."
  ],
  "착지 {1} 하역 후: 폭 방향 빈틈 합계 {0}mm. 에어백 등으로 채움 필요": [
    "After unloading at stop {1}: Total lateral gap {0}mm. Fill with airbags or similar materials.",
    "Sau khi dỡ tại điểm {1}: Tổng khe ngang {0}mm. Cần chèn túi khí hoặc vật liệu tương tự."
  ],
  // Regular operational validator messages. Keep composites explicit: captured IDs,
  // segregation classes and temperature-zone names are opaque, never translated recursively.
  "{0}: 적재 공간 경계를 벗어났습니다.": [
    "{0}: Outside the loading-space boundaries.",
    "{0}: Ra ngoài ranh giới không gian xếp hàng."
  ],
  "{0}와 {1}가 겹칩니다.": [
    "{0} and {1} overlap.",
    "{0} và {1} chồng lấn nhau."
  ],
  "{0}: 도어 개구 {1}×{2}mm를 통과할 수 없습니다.": [
    "{0}: Cannot pass through the {1}×{2}mm door opening.",
    "{0}: Không thể đi qua cửa mở {1}×{2}mm."
  ],
  "{0}: 지지율 {1}%로 기준 {2}% 미만입니다.": [
    "{0}: Support ratio {1}% is below the required {2}%.",
    "{0}: Tỷ lệ đỡ {1}% thấp hơn mức yêu cầu {2}%."
  ],
  "{0}: 무게중심 투영점이 지지 영역 밖에 있습니다.": [
    "{0}: The projected center of gravity is outside the support area.",
    "{0}: Hình chiếu trọng tâm nằm ngoài vùng đỡ."
  ],
  "{0}: 혼합 화물을 포함한 최대 적층단을 초과했습니다.": [
    "{0}: The maximum stacking-layer count, including mixed cargo, is exceeded.",
    "{0}: Vượt số tầng xếp chồng tối đa, bao gồm hàng hỗn hợp."
  ],
  "{0}: 누적 상부하중 {1}kg이 허용 {2}kg을 초과했습니다.": [
    "{0}: Cumulative top load {1}kg exceeds the permitted {2}kg.",
    "{0}: Tải phía trên tích lũy {1}kg vượt mức cho phép {2}kg."
  ],
  "{0}: 누적 상부 압력이 허용 면적하중을 초과했습니다.": [
    "{0}: Cumulative top pressure exceeds the permitted area load.",
    "{0}: Áp lực phía trên tích lũy vượt tải diện tích cho phép."
  ],
  "{0}: 먼저 하역해야 하지만 나중 하역 화물이 위를 막고 있습니다.": [
    "{0}: Must be unloaded first, but later-unloading cargo is blocking it from above.",
    "{0}: Cần dỡ trước nhưng bị hàng dỡ sau chặn phía trên."
  ],
  "{0}: 도어 방향 반출 경로가 나중 하역 화물에 막혀 있습니다.": [
    "{0}: The unloading path toward the door is blocked by later-unloading cargo.",
    "{0}: Đường dỡ hàng về phía cửa bị hàng dỡ sau chặn."
  ],
  "화물 총중량 {0}kg이 허용 {1}kg을 초과했습니다.": [
    "Total cargo weight {0}kg exceeds the permitted {1}kg.",
    "Tổng khối lượng hàng {0}kg vượt mức cho phép {1}kg."
  ],
  "길이 방향 무게중심 편차 {0}mm가 허용 ±{1}mm를 넘습니다.": [
    "Longitudinal center-of-gravity deviation {0}mm exceeds the permitted ±{1}mm.",
    "Độ lệch trọng tâm theo chiều dọc {0}mm vượt mức cho phép ±{1}mm."
  ],
  "폭 방향 무게중심 편차 {0}mm가 허용 ±{1}mm를 넘습니다.": [
    "Lateral center-of-gravity deviation {0}mm exceeds the permitted ±{1}mm.",
    "Độ lệch trọng tâm theo chiều ngang {0}mm vượt mức cho phép ±{1}mm."
  ],
  "무게중심 높이 {0}mm가 권장 한도 {1}mm를 넘습니다.": [
    "Center-of-gravity height {0}mm exceeds the recommended limit {1}mm.",
    "Chiều cao trọng tâm {0}mm vượt giới hạn khuyến nghị {1}mm."
  ],
  "도어 쪽 빈 공간이 {0}mm입니다. 블로킹·에어백·래싱 고정을 검토하세요.": [
    "The door-side void is {0}mm. Consider securing with blocking, airbags or lashing.",
    "Khoảng trống phía cửa là {0}mm. Hãy xem xét cố định bằng chèn, túi khí hoặc chằng buộc."
  ],
  "{0}: 측방 전도 위험이 있어 블로킹 또는 래싱이 필요합니다.": [
    "{0}: Risk of sideways tipping; blocking or lashing is required.",
    "{0}: Có nguy cơ lật ngang; cần chèn hoặc chằng buộc."
  ],
  "{0}: 전방 전도 위험이 있어 블로킹 또는 래싱이 필요합니다.": [
    "{0}: Risk of forward tipping; blocking or lashing is required.",
    "{0}: Có nguy cơ lật về trước; cần chèn hoặc chằng buộc."
  ],
  "{0}: 전방 필요 고정력 약 {1}daN입니다.": [
    "{0}: Required forward restraint is approximately {1}daN.",
    "{0}: Lực giữ cần thiết về phía trước khoảng {1}daN."
  ],
  "안쪽 절반에 화물 중량의 {0}%가 실려 기준 {1}%를 넘습니다. 중량 배분을 확인하세요.": [
    "The inner half carries {0}% of cargo weight, exceeding the {1}% threshold. Check weight distribution.",
    "Nửa phía trong chịu {0}% khối lượng hàng, vượt ngưỡng {1}%. Hãy kiểm tra phân bố khối lượng."
  ],
  "문 쪽 절반에 화물 중량의 {0}%가 실려 기준 {1}%를 넘습니다. 중량 배분을 확인하세요.": [
    "The door-side half carries {0}% of cargo weight, exceeding the {1}% threshold. Check weight distribution.",
    "Nửa phía cửa chịu {0}% khối lượng hàng, vượt ngưỡng {1}%. Hãy kiểm tra phân bố khối lượng."
  ],
  "좌측 절반에 화물 중량의 {0}%가 실려 기준 {1}%를 넘습니다. 중량 배분을 확인하세요.": [
    "The left half carries {0}% of cargo weight, exceeding the {1}% threshold. Check weight distribution.",
    "Nửa bên trái chịu {0}% khối lượng hàng, vượt ngưỡng {1}%. Hãy kiểm tra phân bố khối lượng."
  ],
  "우측 절반에 화물 중량의 {0}%가 실려 기준 {1}%를 넘습니다. 중량 배분을 확인하세요.": [
    "The right half carries {0}% of cargo weight, exceeding the {1}% threshold. Check weight distribution.",
    "Nửa bên phải chịu {0}% khối lượng hàng, vượt ngưỡng {1}%. Hãy kiểm tra phân bố khối lượng."
  ],
  "혼적 금지: {0} 화물과 {1} 화물이 같은 적재공간에 있습니다.": [
    "Incompatible cargo: Classes {0} and {1} are in the same loading space.",
    "Hàng cấm xếp chung: Nhóm {0} và {1} nằm trong cùng không gian xếp hàng."
  ],
  "온도대 혼재: {0} 화물이 같은 적재공간에 있습니다.": [
    "Mixed temperature zones: Cargo in zones {0} is in the same loading space.",
    "Trộn vùng nhiệt độ: Hàng thuộc các vùng {0} nằm trong cùng không gian xếp hàng."
  ],
  "{0}({1}kg)가 더 가벼운 {2}({3}kg) 위에 놓였습니다. 무거운 화물을 아래에 두는지 확인하세요.": [
    "{0} ({1}kg) is placed on lighter cargo {2} ({3}kg). Check that heavier cargo is below.",
    "{0} ({1}kg) được đặt trên hàng nhẹ hơn {2} ({3}kg). Hãy kiểm tra để hàng nặng hơn ở dưới."
  ],
  "{0}: 먼저 하역해야 하지만 나중 하역 화물이 위를 막고 있습니다. 완화 모드: 현장 재취급이 필요합니다.": [
    "{0}: Must be unloaded first, but later-unloading cargo is blocking it from above. Relaxed mode: On-site rehandling is required.",
    "{0}: Cần dỡ trước nhưng bị hàng dỡ sau chặn phía trên. Chế độ nới lỏng: Cần xử lý lại hàng tại hiện trường."
  ],
  "{0}: 도어 방향 반출 경로가 나중 하역 화물에 막혀 있습니다. 완화 모드: 현장 재취급이 필요합니다.": [
    "{0}: The unloading path toward the door is blocked by later-unloading cargo. Relaxed mode: On-site rehandling is required.",
    "{0}: Đường dỡ hàng về phía cửa bị hàng dỡ sau chặn. Chế độ nới lỏng: Cần xử lý lại hàng tại hiện trường."
  ],
  "하역 순서 {0} 완료 후: {1}: 지지율 {2}%로 기준 {3}% 미만입니다.": [
    "After unloading stop {0}: {1}: Support ratio {2}% is below the required {3}%.",
    "Sau khi dỡ xong điểm {0}: {1}: Tỷ lệ đỡ {2}% thấp hơn mức yêu cầu {3}%."
  ],
  "하역 순서 {0} 완료 후: {1}: 무게중심 투영점이 지지 영역 밖에 있습니다.": [
    "After unloading stop {0}: {1}: The projected center of gravity is outside the support area.",
    "Sau khi dỡ xong điểm {0}: {1}: Hình chiếu trọng tâm nằm ngoài vùng đỡ."
  ],
  "하역 순서 {0} 완료 후: {1}: 지지율 {2}%로 기준 {3}% 미만입니다. 완화 모드: 해당 하역 단계에서 재지지·재취급 확인이 필요합니다.": [
    "After unloading stop {0}: {1}: Support ratio {2}% is below the required {3}%. Relaxed mode: Support restoration and rehandling must be checked at this unloading stage.",
    "Sau khi dỡ xong điểm {0}: {1}: Tỷ lệ đỡ {2}% thấp hơn mức yêu cầu {3}%. Chế độ nới lỏng: Cần kiểm tra việc đỡ lại và xử lý lại hàng ở bước dỡ này."
  ],
  "하역 순서 {0} 완료 후: {1}: 무게중심 투영점이 지지 영역 밖에 있습니다. 완화 모드: 해당 하역 단계에서 재지지·재취급 확인이 필요합니다.": [
    "After unloading stop {0}: {1}: The projected center of gravity is outside the support area. Relaxed mode: Support restoration and rehandling must be checked at this unloading stage.",
    "Sau khi dỡ xong điểm {0}: {1}: Hình chiếu trọng tâm nằm ngoài vùng đỡ. Chế độ nới lỏng: Cần kiểm tra việc đỡ lại và xử lý lại hàng ở bước dỡ này."
  ],
  "파렛트 {0}개(번호 {1})의 바닥 단이 파렛트 면적의 {2}% 미만입니다. 최저 {3}%. 파렛트 사이 틈과 흔들림을 확인하세요.": [
    "The bottom layer of {0} pallets (numbers {1}) covers less than {2}% of the pallet area. Lowest coverage: {3}%. Check gaps and movement between pallets.",
    "Tầng đáy của {0} pallet (số {1}) chiếm dưới {2}% diện tích pallet. Mức phủ thấp nhất: {3}%. Hãy kiểm tra khe hở và sự rung lắc giữa các pallet."
  ],
  "수출·2단 적재인데 랩핑이 꺼진 파렛트가 {0}개 있습니다(번호 {1}). 랩핑 사용을 권고합니다.": [
    "For export and 2-high stacking, wrapping is disabled on {0} pallets (numbers {1}). Wrapping is recommended.",
    "Đối với xuất khẩu và xếp chồng 2 tầng, có {0} pallet tắt quấn màng (số {1}). Khuyến nghị sử dụng màng quấn."
  ],
  "수출인데 랩핑이 꺼진 파렛트가 {0}개 있습니다(번호 {1}). 랩핑 사용을 권고합니다.": [
    "For export, wrapping is disabled on {0} pallets (numbers {1}). Wrapping is recommended.",
    "Đối với xuất khẩu, có {0} pallet tắt quấn màng (số {1}). Khuyến nghị sử dụng màng quấn."
  ],
  "2단 적재인데 랩핑이 꺼진 파렛트가 {0}개 있습니다(번호 {1}). 랩핑 사용을 권고합니다.": [
    "For 2-high stacking, wrapping is disabled on {0} pallets (numbers {1}). Wrapping is recommended.",
    "Đối với xếp chồng 2 tầng, có {0} pallet tắt quấn màng (số {1}). Khuyến nghị sử dụng màng quấn."
  ]
};
