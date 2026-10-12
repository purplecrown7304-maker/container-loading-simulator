/** Display-only translations of engine-owned diagnostics. Canonical results remain Korean. */
const engineMessages: Record<string, readonly [string, string]> = {
  "취소됨": [
    "Cancelled",
    "Đã hủy"
  ],
  "적재 계산 결과를 읽지 못했습니다.": [
    "Could not read the loading calculation result.",
    "Không thể đọc kết quả tính toán xếp hàng."
  ],
  "적재 계산 모듈을 실행하지 못했습니다. 다시 시도해 주세요.": [
    "Could not start the loading calculation module. Please try again.",
    "Không thể khởi chạy mô-đun tính toán xếp hàng. Vui lòng thử lại."
  ],
  "컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함": [
    "Cannot load more cargo because it would exceed the container payload limit",
    "Không thể xếp thêm hàng vì sẽ vượt tải trọng cho phép của container"
  ],
  "블록·최대 빈 공간·회전·경계·지지·적층단·상부 허용중량 조건을 동시에 만족하는 안전한 위치를 찾지 못함": [
    "No safe position satisfies the block, maximal empty space, rotation, bounds, support, stacking-layer and top-load constraints together",
    "Không tìm thấy vị trí an toàn đồng thời đáp ứng các điều kiện về khối, khoảng trống cực đại, hướng xoay, ranh giới, đỡ hàng, số tầng xếp và tải trên cho phép"
  ],
  "벽 완성·블록·최대 빈 공간·회전·경계·지지·적층단·상부 허용중량 조건을 동시에 만족하는 안전한 위치를 찾지 못함": [
    "No safe position satisfies the wall completion, block, maximal empty space, rotation, bounds, support, stacking-layer and top-load constraints together",
    "Không tìm thấy vị trí an toàn đồng thời đáp ứng các điều kiện về hoàn thiện vách hàng, khối, khoảng trống cực đại, hướng xoay, ranh giới, đỡ hàng, số tầng xếp và tải trên cho phép"
  ],
  "길이 방향 무게중심 허용범위를 지키기 위해 제외": [
    "Excluded to keep the longitudinal center of gravity within the permitted range",
    "Đã loại ra để giữ trọng tâm theo chiều dọc trong phạm vi cho phép"
  ],
  "선택한 적재 전략으로 블록·빈 공간·낮은 높이 후보를 비교한 배치입니다.": [
    "This layout compares block, empty-space and low-height candidates using the selected loading strategy.",
    "Bố trí này so sánh các phương án khối, khoảng trống và chiều cao thấp theo chiến lược xếp hàng đã chọn."
  ],
  "안쪽부터 채우는 원칙에 따라 컨테이너 깊은 쪽에 우선 배치되었습니다.": [
    "Placed toward the deep end of the container first, following the inside-first loading principle.",
    "Được ưu tiên xếp ở phía sâu bên trong container theo nguyên tắc xếp từ trong ra ngoài."
  ],
  "안쪽의 선행 블록 뒤에 이어지는 중앙 구역에 배치되었습니다.": [
    "Placed in the middle zone following the preceding inner blocks.",
    "Được xếp ở khu vực giữa, nối tiếp các khối phía trong."
  ],
  "앞선 완전 블록 또는 후순위 잔량 처리 이후 문쪽 구역에 배치되었습니다.": [
    "Placed in the door-side zone after the preceding complete blocks or lower-priority remaining cargo.",
    "Được xếp ở khu vực phía cửa sau các khối hoàn chỉnh phía trước hoặc phần hàng còn lại có ưu tiên thấp hơn."
  ],
  "{0}개는 바닥 면적 활용도를 높이기 위해 90도 회전 배치되었습니다.": [
    "{0} boxes were rotated 90 degrees to improve floor-area utilization.",
    "{0} thùng được xoay 90 độ để tận dụng diện tích sàn tốt hơn."
  ],
  "최대 적층단 {0}단을 넘지 않도록 제한했습니다.": [
    "Stacking was limited to a maximum of {0} layers.",
    "Đã giới hạn xếp chồng tối đa {0} tầng."
  ],
  "하부 박스당 상부 허용중량 {0}kg 제약을 적용했습니다.": [
    "An allowable top-load limit of {0}kg per lower box was applied.",
    "Đã áp dụng giới hạn tải trên cho phép {0}kg cho mỗi thùng phía dưới."
  ],
  "완전한 동일품목 블록을 먼저 만든 뒤 남은 수량은 후순위 혼합 적재로 넘겼습니다.": [
    "Complete same-SKU blocks were formed first, then the remaining quantity was passed to lower-priority mixed loading.",
    "Các khối hoàn chỉnh cùng mã hàng được tạo trước, sau đó số lượng còn lại được chuyển sang xếp hỗn hợp có ưu tiên thấp hơn."
  ],
  "미적재 {0}개: {1}": [
    "{0} not loaded: {1}",
    "Chưa xếp {0}: {1}"
  ],
  "현재 조건에서 적재 결과가 생성되지 않았습니다.": [
    "No loading result was generated under the current conditions.",
    "Không tạo được kết quả xếp hàng với các điều kiện hiện tại."
  ],
  "선택 전략에 따라 여러 블록·빈 공간·높이 후보를 비교하고, 남은 화물의 안전한 추가 위치를 다시 검사합니다.": [
    "The selected strategy compares multiple block, empty-space and height candidates, then rechecks safe additional positions for remaining cargo.",
    "Chiến lược đã chọn so sánh nhiều phương án khối, khoảng trống và chiều cao, rồi kiểm tra lại các vị trí an toàn để xếp thêm hàng còn lại."
  ],
  "배치 후보는 컨테이너 경계, 충돌, 최대 적층단, 상부 허용중량, 최대 적재중량을 통과해야 합니다.": [
    "Placement candidates must pass container bounds, collision, stacking-layer, top-load and payload checks.",
    "Các phương án bố trí phải đạt kiểm tra ranh giới container, va chạm, số tầng xếp, tải trên và tải trọng cho phép."
  ],
  "계산된 후보 중 적재량과 선택 목표가 좋은 안을 사용합니다. 모든 조합의 전역 최적해를 증명하는 방식은 아닙니다.": [
    "The selected computed candidate performs well on loaded quantity and the chosen objective. This does not prove a global optimum over every combination.",
    "Phương án tính được lựa chọn đạt kết quả tốt về lượng hàng xếp và mục tiêu đã chọn. Phương pháp này không chứng minh nghiệm tối ưu toàn cục trên mọi tổ hợp."
  ],
  "{0} · {1}단 낮춤": [
    "{0} · Lower by {1} layers",
    "{0} · Hạ {1} tầng"
  ],
  "바닥 허용하중(kg/m²) 초과 · 투영 국부하중을 만족하는 위치 부족": [
    "Floor-load limit (kg/m²) exceeded · Too few positions satisfy the projected local load limit",
    "Vượt tải sàn cho phép (kg/m²) · Không đủ vị trí đáp ứng giới hạn tải cục bộ chiếu xuống sàn"
  ],
  "기존 운영 오류": [
    "Existing operational error",
    "Lỗi vận hành hiện có"
  ],
  "박스 크기가 허용 회전 방향에서 컨테이너 적재공간을 초과함": [
    "Box dimensions exceed the container loading space in the permitted orientations",
    "Kích thước thùng vượt không gian xếp hàng của container ở các hướng xoay cho phép"
  ],
  "신고된 적층·상부하중·높이 한도 안에서 연속 작업 블록을 만들 수 없음": [
    "Cannot form a continuous working block within the declared stacking, top-load and height limits",
    "Không thể tạo khối thao tác liên tục trong giới hạn số tầng xếp, tải trên và chiều cao đã khai báo"
  ],
  "허용된 바닥 방향으로 배치할 수 없음": [
    "Cannot place the box in a permitted floor orientation",
    "Không thể đặt thùng theo hướng mặt đáy được phép"
  ],
  "안쪽부터 중량순으로 진행하는 연속 작업 블록에 안전한 자리가 부족함": [
    "Too few safe positions in the continuous working blocks loaded from inside outward by weight",
    "Không đủ vị trí an toàn trong các khối thao tác liên tục xếp từ trong ra ngoài theo trọng lượng"
  ],
  "중량순 연속 적재의 최종 안전 재검사에 실패했습니다.": [
    "The final safety recheck failed for continuous loading by weight.",
    "Kiểm tra lại an toàn cuối cùng của phương án xếp liên tục theo trọng lượng không đạt."
  ],
  "명시된 하역 순서가 중량순 적재와 충돌하여 하역 경로를 우선했습니다. 각 하역 구역 안에서는 박스 1개 총중량이 무거운 순서로 안쪽부터 연속 적재했습니다.": [
    "The explicit unloading order conflicted with loading by weight, so unloading access took priority. Within each unloading zone, boxes were loaded continuously from inside outward by descending individual gross weight.",
    "Thứ tự dỡ hàng đã chỉ định xung đột với xếp theo trọng lượng, nên ưu tiên lối dỡ hàng. Trong từng khu vực dỡ, các thùng được xếp liên tục từ trong ra ngoài theo tổng trọng lượng từng thùng từ nặng đến nhẹ."
  ],
  "허용 회전 규격 또는 단품 중량이 적재공간 한도를 초과함": [
    "Permitted rotated dimensions or individual weight exceed the loading-space limits",
    "Kích thước theo hướng xoay cho phép hoặc trọng lượng từng kiện vượt giới hạn không gian xếp hàng"
  ],
  "적재 규칙 재검사 실패: 안전한 배치를 찾지 못했습니다.": [
    "Loading-rule recheck failed: no safe layout was found.",
    "Kiểm tra lại quy tắc xếp hàng không đạt: không tìm được bố trí an toàn."
  ],
  "(빈 SKU)": [
    "(Empty SKU)",
    "(SKU trống)"
  ],
  "층별 적재에서 높이·적층·바닥하중 한도 안의 자리가 부족함": [
    "Too few positions within the height, stacking and floor-load limits for level loading",
    "Không đủ vị trí trong giới hạn chiều cao, số tầng xếp và tải sàn khi xếp theo từng tầng"
  ],
  "WHAT-IF REVIEW 설정 형식이 올바르지 않습니다.": [
    "The WHAT-IF REVIEW configuration format is invalid.",
    "Định dạng cấu hình WHAT-IF REVIEW không hợp lệ."
  ],
  "선택할 수 없는 검토 한도 항목이 있습니다.": [
    "The review contains a limit setting that cannot be selected.",
    "Phần xem xét có mục giới hạn không được phép chọn."
  ],
  "{0}: {1}~{2} 범위의 {3}를 입력하세요.": [
    "{0}: enter a {3} in the range {1}–{2}.",
    "{0}: nhập {3} trong phạm vi {1}–{2}."
  ],
  "원래 장비 입력 오류: {0}": [
    "Original equipment input error: {0}",
    "Lỗi dữ liệu phương tiện gốc: {0}"
  ],
  "원래 화물 입력 오류 ({0}): {1}": [
    "Original cargo input error ({0}): {1}",
    "Lỗi dữ liệu hàng hóa gốc ({0}): {1}"
  ],
  "검토 총중량": [
    "Review gross weight",
    "Tổng trọng lượng xem xét"
  ],
  "검토 바닥하중": [
    "Review floor load",
    "Tải sàn xem xét"
  ],
  "검토 최소 지지율": [
    "Review minimum support ratio",
    "Tỷ lệ đỡ tối thiểu xem xét"
  ],
  "품목별 검토 한도 형식이 올바르지 않습니다.": [
    "The per-item review limit format is invalid.",
    "Định dạng giới hạn xem xét theo từng mặt hàng không hợp lệ."
  ],
  "검토 한도의 품목을 찾을 수 없습니다: {0}": [
    "Cannot find the item for the review limit: {0}",
    "Không tìm thấy mặt hàng của giới hạn xem xét: {0}"
  ],
  "품목 {0}: 검토 한도 형식이 올바르지 않습니다.": [
    "Item {0}: the review limit format is invalid.",
    "Mặt hàng {0}: định dạng giới hạn xem xét không hợp lệ."
  ],
  "{0} 검토 적층단": [
    "{0} review stacking layers",
    "Số tầng xếp xem xét của {0}"
  ],
  "{0} 검토 상부하중": [
    "{0} review top load",
    "Tải trên xem xét của {0}"
  ],
  "관성 검토 한도 형식이 올바르지 않습니다.": [
    "The inertia review limit format is invalid.",
    "Định dạng giới hạn xem xét quán tính không hợp lệ."
  ],
  "검토 변위": [
    "Review displacement",
    "Độ dịch chuyển xem xét"
  ],
  "검토 회전각": [
    "Review rotation angle",
    "Góc xoay xem xét"
  ],
  "WHAT-IF REVIEW는 legacy 직접 박스 적재만 지원합니다. A·팔레트·MIXED는 엄격 모드로 전환하세요.": [
    "WHAT-IF REVIEW supports only legacy direct-box loading. Switch A-rules, pallet and MIXED loading to strict mode.",
    "WHAT-IF REVIEW chỉ hỗ trợ xếp thùng trực tiếp kiểu legacy. Hãy chuyển chế độ A, pallet và MIXED sang chế độ nghiêm ngặt."
  ],
  "화물과 필수 고정재 합계가 선택한 검토 총중량 한도를 초과합니다.": [
    "Cargo plus required securing materials exceeds the selected review gross-weight limit.",
    "Tổng trọng lượng hàng hóa và vật liệu cố định bắt buộc vượt giới hạn tổng trọng lượng xem xét đã chọn."
  ],
  "WHAT-IF REVIEW: 원래 안전 한도 위반은 유지됩니다. 운송 승인·안전 인증이 아닙니다.": [
    "WHAT-IF REVIEW: original safety-limit violations remain. This is not transport approval or safety certification.",
    "WHAT-IF REVIEW: các vi phạm giới hạn an toàn gốc vẫn được giữ lại. Đây không phải phê duyệt vận chuyển hay chứng nhận an toàn."
  ],
  "적재 계산에 실패했습니다.": [
    "Loading calculation failed.",
    "Tính toán xếp hàng thất bại."
  ],
  "BLOCKS_UNLOAD_PATH: 먼저 내릴 화물의 반출 경로가 차단됩니다.": [
    "BLOCKS_UNLOAD_PATH: the removal path for cargo to be unloaded first is blocked.",
    "BLOCKS_UNLOAD_PATH: lối đưa hàng cần dỡ trước ra ngoài bị chặn."
  ],
  "화물 치수·좌표·중량이 유효하지 않습니다.": [
    "Cargo dimensions, coordinates or weight are invalid.",
    "Kích thước, tọa độ hoặc trọng lượng hàng hóa không hợp lệ."
  ],
  "등록 화물의 규격·회전 허용·중량과 배치가 일치하지 않습니다.": [
    "The placement does not match the registered cargo dimensions, permitted rotations or weight.",
    "Bố trí không khớp với kích thước, hướng xoay cho phép hoặc trọng lượng hàng hóa đã đăng ký."
  ],
  "ORIENTATION_RESTRICTED: 허용되지 않은 화물 방향입니다.": [
    "ORIENTATION_RESTRICTED: the cargo orientation is not permitted.",
    "ORIENTATION_RESTRICTED: hướng đặt hàng hóa không được phép."
  ],
  "바닥 전용 화물은 상부에 적층할 수 없습니다.": [
    "Floor-only cargo cannot be stacked above other cargo.",
    "Hàng chỉ được đặt trên sàn không thể xếp lên trên hàng khác."
  ],
  "화물의 지지 면적 또는 무게중심 지지가 부족합니다.": [
    "Cargo has insufficient supporting area or center-of-gravity support.",
    "Hàng hóa không có đủ diện tích đỡ hoặc điểm đỡ trọng tâm."
  ],
  "화물 {0}의 등록 수량을 초과했습니다.": [
    "The registered quantity for cargo {0} has been exceeded.",
    "Đã vượt số lượng đăng ký của hàng hóa {0}."
  ],
  "혼합 화물을 포함한 최대 적층단을 초과했습니다.": [
    "The maximum stacking layers, including mixed cargo, have been exceeded.",
    "Đã vượt số tầng xếp tối đa, kể cả hàng hỗn hợp."
  ],
  "누적 상부 하중 {0}kg이 허용치 {1}kg을 초과했습니다.": [
    "Cumulative top load {0}kg exceeds the allowable limit {1}kg.",
    "Tải trên tích lũy {0}kg vượt giới hạn cho phép {1}kg."
  ],
  "TOP_PRESSURE_LIMIT: 누적 상부 압력이 허용 면적하중을 초과했습니다.": [
    "TOP_PRESSURE_LIMIT: cumulative top pressure exceeds the allowable load per area.",
    "TOP_PRESSURE_LIMIT: áp lực trên tích lũy vượt tải cho phép trên đơn vị diện tích."
  ],
  "운송 장비의 허용 적재 중량을 초과했습니다.": [
    "The transport equipment payload limit has been exceeded.",
    "Đã vượt tải trọng cho phép của phương tiện vận chuyển."
  ],
  "FLOOR_LOAD_LIMIT: 투영 국부 바닥하중이 장비 한도를 초과했습니다.": [
    "FLOOR_LOAD_LIMIT: projected local floor load exceeds the equipment limit.",
    "FLOOR_LOAD_LIMIT: tải cục bộ chiếu xuống sàn vượt giới hạn phương tiện."
  ],
  "빈 공간 {0}곳({1}m³)에 메움·버팀 계획이 필요합니다. 자재 {2}kg, 적용범위 밖 {3}곳. 앱 기본값이며 현장 자재로 확인 필요합니다.": [
    "{0} voids ({1}m³) need a void-fill and bracing plan. Material: {2}kg; {3} voids outside the supported scope. These are app defaults and must be verified with on-site materials.",
    "{0} khoảng trống ({1}m³) cần kế hoạch chèn lấp và chống đỡ. Vật liệu: {2}kg; {3} khoảng trống ngoài phạm vi áp dụng. Đây là giá trị mặc định của ứng dụng, cần xác minh bằng vật liệu thực tế tại hiện trường."
  ],
  "화물과 현재 고정재의 합계가 최대 허용중량을 초과합니다. 검토용 배치이며 다시 적재해야 합니다.": [
    "Cargo plus current securing materials exceeds the maximum allowable weight. This layout is for review only and must be reloaded.",
    "Tổng trọng lượng hàng hóa và vật liệu cố định hiện tại vượt trọng lượng tối đa cho phép. Bố trí này chỉ để xem xét và phải xếp lại."
  ],
  "필수 고정·메움재를 포함하면 최대 허용중량을 초과합니다.": [
    "Including required securing and void-fill materials exceeds the maximum allowable weight.",
    "Khi tính cả vật liệu cố định và chèn lấp bắt buộc, trọng lượng vượt mức tối đa cho phép."
  ],
  "화물과 필수 고정재 합계의 중량 한도를 확보하기 위해 미적재": [
    "Not loaded to keep cargo plus required securing materials within the weight limit",
    "Chưa xếp để giữ tổng trọng lượng hàng hóa và vật liệu cố định bắt buộc trong giới hạn"
  ],
  "{0} (필수 고정재 중량 {1}kg 포함)": [
    "{0} (including {1}kg of required securing materials)",
    "{0} (bao gồm {1}kg vật liệu cố định bắt buộc)"
  ],
  "화물과 필수 고정재의 합계가 최대 허용중량을 초과합니다.": [
    "Cargo plus required securing materials exceeds the maximum allowable weight.",
    "Tổng trọng lượng hàng hóa và vật liệu cố định bắt buộc vượt trọng lượng tối đa cho phép."
  ],
  "WHAT-IF REVIEW 계산 차단: {0}": [
    "WHAT-IF REVIEW calculation blocked: {0}",
    "Tính toán WHAT-IF REVIEW bị chặn: {0}"
  ],
  "WHAT-IF REVIEW: 화물과 필수 고정재의 합계가 원래 최대 허용중량을 초과합니다.": [
    "WHAT-IF REVIEW: cargo plus required securing materials exceeds the original maximum allowable weight.",
    "WHAT-IF REVIEW: tổng trọng lượng hàng hóa và vật liệu cố định bắt buộc vượt trọng lượng tối đa cho phép ban đầu."
  ],
  "화물과 필수 고정·메움재 합계가 원래 허용 적재 중량을 초과합니다.": [
    "Cargo plus required securing and void-fill materials exceeds the original payload limit.",
    "Tổng trọng lượng hàng hóa cùng vật liệu cố định và chèn lấp bắt buộc vượt tải trọng cho phép ban đầu."
  ],
  "파렛트 단위가 컨테이너의 안전한 EMS에 배치되지 못함": [
    "The pallet unit could not be placed in a safe container EMS",
    "Không thể đặt đơn vị pallet vào khoảng trống cực đại an toàn của container"
  ],
  "팔레트 길이·폭·높이는 0보다 큰 유한한 값이어야 함": [
    "Pallet length, width and height must be finite values greater than 0",
    "Chiều dài, rộng và cao của pallet phải là các giá trị hữu hạn lớn hơn 0"
  ],
  "팔레트 자중은 0 이상의 유한한 값이어야 함": [
    "Pallet tare weight must be a finite value of 0 or greater",
    "Trọng lượng pallet rỗng phải là giá trị hữu hạn từ 0 trở lên"
  ],
  "팔레트 최대 적재중량은 0보다 큰 유한한 값이어야 함": [
    "Pallet maximum payload must be a finite value greater than 0",
    "Tải trọng tối đa của pallet phải là giá trị hữu hạn lớn hơn 0"
  ],
  "팔레트 최대 적층단은 1 이상의 정수여야 함": [
    "Pallet maximum stacking levels must be an integer of 1 or greater",
    "Số tầng pallet xếp chồng tối đa phải là số nguyên từ 1 trở lên"
  ],
  "팔레트 상부 허용중량은 0 이상의 유한한 값이어야 함": [
    "Pallet allowable top load must be a finite value of 0 or greater",
    "Tải trên cho phép của pallet phải là giá trị hữu hạn từ 0 trở lên"
  ],
  "팔레트 정하중은 0 이상의 유한한 값이어야 함": [
    "Pallet static load must be a finite value of 0 or greater",
    "Tải tĩnh của pallet phải là giá trị hữu hạn từ 0 trở lên"
  ],
  "각대 중량·추가 높이는 0 이상의 유한한 값이어야 함": [
    "Corner-guard weight and extra height must be finite values of 0 or greater",
    "Trọng lượng và chiều cao tăng thêm của nẹp góc phải là các giá trị hữu hạn từ 0 trở lên"
  ],
  "랩핑 중량·추가 높이는 0 이상의 유한한 값이어야 함": [
    "Wrapping weight and extra height must be finite values of 0 or greater",
    "Trọng lượng và chiều cao tăng thêm của màng quấn phải là các giá trị hữu hạn từ 0 trở lên"
  ],
  "최상단 최소충전율은 0~1 사이의 유한한 값이어야 함": [
    "Minimum top-layer fill ratio must be a finite value between 0 and 1",
    "Tỷ lệ lấp đầy tầng trên cùng tối thiểu phải là giá trị hữu hạn từ 0 đến 1"
  ],
  "PALLET_LIMIT: 수령처 지정 팔레트 규격과 일치하지 않음": [
    "PALLET_LIMIT: does not match the pallet specification required by the recipient",
    "PALLET_LIMIT: không khớp quy cách pallet do bên nhận yêu cầu"
  ],
  "WHAT-IF REVIEW는 팔레트·MIXED 적재를 지원하지 않습니다. 엄격 모드로 전환하세요.": [
    "WHAT-IF REVIEW does not support pallet or MIXED loading. Switch to strict mode.",
    "WHAT-IF REVIEW không hỗ trợ xếp pallet hoặc MIXED. Hãy chuyển sang chế độ nghiêm ngặt."
  ],
  "최상단 최소충전율 {0}% 적용 후: {1}": [
    "After applying minimum top-layer fill of {0}%: {1}",
    "Sau khi áp dụng độ lấp đầy tối thiểu tầng trên cùng {0}%: {1}"
  ],
  "파렛트 규격이 컨테이너 바닥 크기에 맞지 않음": [
    "The pallet dimensions do not fit the container floor",
    "Kích thước pallet không vừa sàn container"
  ],
  "박스 크기가 파렛트 바닥 또는 컨테이너 유효 높이에 맞지 않음 · 허용 회전 검사 완료": [
    "The box does not fit the pallet deck or usable container height · Permitted rotations checked",
    "Kích thước thùng không vừa mặt pallet hoặc chiều cao hữu dụng của container · Đã kiểm tra các hướng xoay cho phép"
  ],
  "박스 1개 중량이 파렛트 허용 적재중량을 초과함": [
    "The weight of one box exceeds the pallet payload limit",
    "Trọng lượng một thùng vượt tải trọng cho phép của pallet"
  ],
  "컨테이너 최대 적재 중량 초과 · 파렛트와 포장재 중량 포함": [
    "Container payload limit exceeded · Includes pallet and packaging weight",
    "Vượt tải trọng cho phép của container · Bao gồm trọng lượng pallet và vật liệu đóng gói"
  ],
  "사용 가능한 파렛트 공간에서 지지·적층단·누적 상부하중·포장 여유를 만족하는 추가 위치 없음": [
    "No additional position in the available pallet space satisfies support, stacking-layer, cumulative top-load and packaging-clearance constraints",
    "Không còn vị trí trong không gian pallet đáp ứng các ràng buộc về đỡ hàng, số tầng xếp, tải trên tích lũy và khoảng hở đóng gói"
  ],
  "파렛트 추천 계산에 실패했습니다.": [
    "Pallet recommendation calculation failed.",
    "Tính toán đề xuất pallet thất bại."
  ],
  "파렛트 추천 결과를 읽지 못했습니다.": [
    "Could not read the pallet recommendation result.",
    "Không thể đọc kết quả đề xuất pallet."
  ],
  "파렛트 추천 계산 모듈을 실행하지 못했습니다.": [
    "Could not start the pallet recommendation module.",
    "Không thể khởi chạy mô-đun đề xuất pallet."
  ],
  "A 규칙 최종 검사 실패: ": [
    "A-rules final validation failed: ",
    "Kiểm tra cuối cùng quy tắc A không đạt: "
  ],
  "물리 시나리오 계산에 실패했습니다.": [
    "Physics scenario calculation failed.",
    "Tính toán kịch bản vật lý thất bại."
  ],
  "출발 가속 {0}g": [
    "Starting acceleration {0}g",
    "Gia tốc khởi hành {0}g"
  ],
  "급제동 {0}g": [
    "Hard braking {0}g",
    "Phanh gấp {0}g"
  ],
  "횡가속 {0}g": [
    "Lateral acceleration {0}g",
    "Gia tốc ngang {0}g"
  ],
  "{0}: 불안정 {1}개 · 주의 {2}개 감지. 재배치가 필요합니다.": [
    "{0}: detected {1} unstable items and {2} warnings. Rearrangement is required.",
    "{0}: phát hiện {1} kiện mất ổn định và {2} kiện cần chú ý. Cần bố trí lại."
  ],
  "{0}: 붕괴 수준의 이동은 없지만 {1}개 위치 재확인이 필요합니다.": [
    "{0}: no collapse-level movement, but {1} positions need rechecking.",
    "{0}: không có dịch chuyển đến mức đổ sập, nhưng cần kiểm tra lại {1} vị trí."
  ],
  "{0}: 전체 적재물이 안정적으로 유지되었습니다.": [
    "{0}: all loaded cargo remained stable.",
    "{0}: toàn bộ hàng đã xếp vẫn ổn định."
  ],
  "허용 회전 방향에서도 박스 크기가 적재공간 내부 규격에 맞지 않음": [
    "Box dimensions do not fit the interior loading space even in permitted orientations",
    "Kích thước thùng không vừa không gian xếp hàng bên trong, kể cả ở các hướng xoay cho phép"
  ],
  "컨테이너 최대 적재 중량 초과 · 남은 허용중량 부족": [
    "Container payload limit exceeded · Insufficient remaining allowable weight",
    "Vượt tải trọng cho phép của container · Tải trọng cho phép còn lại không đủ"
  ],
  "잔여 공간 부족 · 남은 전체 용적이 박스 1개보다 작음": [
    "Insufficient remaining space · Total remaining volume is smaller than one box",
    "Không đủ không gian còn lại · Tổng thể tích còn lại nhỏ hơn một thùng"
  ],
  "잔여 공간의 가로·세로·높이에 박스가 맞지 않음 · 허용 회전 및 빈 공간 재검사 완료": [
    "The box does not fit the remaining length, width and height · Permitted rotations and empty spaces rechecked",
    "Thùng không vừa chiều dài, rộng và cao còn lại · Đã kiểm tra lại các hướng xoay cho phép và khoảng trống"
  ],
  "빈 공간은 있으나 박스 바닥을 충분히 지지할 수 없음": [
    "Empty space exists, but cannot sufficiently support the box base",
    "Có khoảng trống nhưng không thể đỡ đủ mặt đáy thùng"
  ],
  "추가 적재 시 최대 적층단 또는 누적 상부 허용중량 초과": [
    "Additional loading would exceed maximum stacking layers or cumulative allowable top load",
    "Xếp thêm sẽ vượt số tầng tối đa hoặc tải trên tích lũy cho phép"
  ],
  "추가 적재 시 먼저 하역할 화물의 접근 경로가 차단됨": [
    "Additional loading would block access to cargo that must be unloaded first",
    "Xếp thêm sẽ chặn lối tiếp cận hàng cần dỡ trước"
  ],
  "컨테이너 최대 적재 중량 초과": [
    "Container payload limit exceeded",
    "Vượt tải trọng cho phép của container"
  ],
  "현재 배치의 안전한 추가 적재 위치 없음": [
    "No safe additional loading position in the current layout",
    "Không có vị trí an toàn để xếp thêm trong bố trí hiện tại"
  ],
  "박스 강도 미확인": [
    "Unverified box strength",
    "Chưa xác minh độ bền thùng"
  ],
  "바닥 전용 화물": [
    "Floor-only cargo",
    "Hàng chỉ đặt trên sàn"
  ],
  "최대 적층단 {0}단": [
    "Maximum {0} stacking layers",
    "Tối đa {0} tầng xếp"
  ],
  "상부 허용하중 {0} kg": [
    "Allowable top load {0} kg",
    "Tải trên cho phép {0} kg"
  ],
  "적층 {0}단 제한({1})으로 위에 쌓을 수 없어 바닥 자리가 부족함. 높이로는 {2}단까지 가능합니다. 박스 관리에서 최대 적층단·상부 허용하중을 확인하세요.": [
    "The {0}-layer limit ({1}) prevents further stacking, leaving insufficient floor space. Height would allow {2} layers. Check maximum stacking layers and allowable top load in box management.",
    "Giới hạn {0} tầng ({1}) không cho phép xếp thêm lên trên, nên không đủ chỗ trên sàn. Chiều cao cho phép {2} tầng. Hãy kiểm tra số tầng xếp tối đa và tải trên cho phép trong quản lý thùng."
  ],
  "화물 사이 내부 빈 통로를 만들지 않는 연속 벽 적재 또는 동일 바닥면 100% 지지 적층 위치를 찾지 못함": [
    "No continuous wall-loading position without internal empty aisles, or stacking position with 100% support on the same footprint, was found",
    "Không tìm thấy vị trí xếp vách liên tục không tạo lối trống bên trong giữa hàng, hoặc vị trí xếp chồng được đỡ 100% trên cùng diện tích đáy"
  ],
  "{0} · 평균 {1}m": [
    "{0} · Average {1}m",
    "{0} · Trung bình {1}m"
  ],
  "중앙 구역 높이가 안쪽보다 과도하게 높습니다. 뿔 모양 적재를 확인하세요. 평균 높이 안쪽 {0}m / 중앙 {1}m, 최고 높이 안쪽 {2}m / 중앙 {3}m.": [
    "The middle zone is excessively higher than the inner zone. Check for a tower-shaped load. Average height: inner {0}m / middle {1}m; maximum height: inner {2}m / middle {3}m.",
    "Khu vực giữa cao hơn quá nhiều so với phía trong. Hãy kiểm tra bố trí dạng tháp. Chiều cao trung bình: phía trong {0}m / giữa {1}m; chiều cao tối đa: phía trong {2}m / giữa {3}m."
  ],
  "문쪽 평균 적재 높이가 중앙보다 높습니다. 하역 안정성을 위해 문쪽 돌출 적재를 확인하세요. 중앙 {0}m / 문쪽 {1}m.": [
    "Average loading height at the door is higher than in the middle. Check protruding door-side loads for unloading stability. Middle {0}m / door {1}m.",
    "Chiều cao xếp trung bình phía cửa cao hơn khu vực giữa. Hãy kiểm tra phần hàng nhô cao phía cửa để bảo đảm ổn định khi dỡ. Giữa {0}m / phía cửa {1}m."
  ],
  "중앙 구역이 안쪽보다 많이 채워져 있습니다. 안쪽 우선 적재 결과를 확인하세요.": [
    "The middle zone is much fuller than the inner zone. Check the inside-first loading result.",
    "Khu vực giữa được lấp đầy nhiều hơn phía trong. Hãy kiểm tra kết quả xếp ưu tiên phía trong."
  ],
  "안쪽 여유가 큰데 문쪽 적재 비율이 높습니다. 후순위 적재 흐름을 확인하세요.": [
    "The door-side loading ratio is high while substantial space remains inside. Check the lower-priority loading sequence.",
    "Tỷ lệ xếp phía cửa cao trong khi phía trong còn nhiều chỗ trống. Hãy kiểm tra trình tự xếp hàng ưu tiên thấp hơn."
  ]
};

type Template = readonly [string, string, string];
const literal = (ko: string, en: string, vi: string): Template => [ko, en, vi];
const add = ([ko, en, vi]: Template): void => { engineMessages[ko] = [en, vi]; };
/** Compose only declared engine fragments, never an arbitrary captured value or user label. */
function combine(...parts: Template[]): Template {
  const result = ['', '', ''];
  let offset = 0;
  for (const part of parts) {
    const indexes = [...part[0].matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
    part.forEach((text, language) => {
      result[language] += text.replace(/\{(\d+)\}/g, (_, index: string) => `{${Number(index) + offset}}`);
    });
    offset += indexes.length ? Math.max(...indexes) + 1 : 0;
  }
  return result as unknown as Template;
}

add(literal('0 초과', 'Greater than 0', 'Lớn hơn 0'));
add(literal('정수', 'Integer', 'Số nguyên'));
add(literal('유한한 수', 'Finite number', 'Số hữu hạn'));

add(literal('A 규칙 최종 검사 실패: {0}', 'A-rules final validation failed: {0}', 'Kiểm tra cuối cùng quy tắc A không đạt: {0}'));

// Source order is fixed by declaredStackCap; each subset is a known built-in cause.
const stackCauses: Template[] = [
  literal('박스 강도 미확인', 'Unverified box strength', 'Chưa xác minh độ bền thùng'),
  literal('바닥 전용 화물', 'Floor-only cargo', 'Hàng chỉ đặt trên sàn'),
  literal('최대 적층단 {0}단', 'Maximum {0} stacking layers', 'Tối đa {0} tầng xếp'),
  literal('상부 허용하중 {0} kg', 'Allowable top load {0} kg', 'Tải trên cho phép {0} kg'),
];
for (let mask = 1; mask < 1 << stackCauses.length; mask += 1) {
  const causes = stackCauses.filter((_, index) => mask & (1 << index));
  const joined = combine(...causes.flatMap((part, index) => index ? [literal(' · ', ' · ', ' · '), part] : [part]));
  add(joined);
  add(combine(
    literal('적층 {0}단 제한(', 'The {0}-layer limit (', 'Giới hạn {0} tầng ('), joined,
    literal(')으로 위에 쌓을 수 없어 바닥 자리가 부족함. 높이로는 {0}단까지 가능합니다. 박스 관리에서 최대 적층단·상부 허용하중을 확인하세요.',
      ') prevents further stacking, leaving insufficient floor space. Height would allow {0} layers. Check maximum stacking layers and allowable top load in box management.',
      ') không cho phép xếp thêm lên trên, nên không đủ chỗ trên sàn. Chiều cao cho phép {0} tầng. Hãy kiểm tra số tầng xếp tối đa và tải trên cho phép trong quản lý thùng.'),
  ));
}

// These are generated numeric-input labels, not arbitrary user text. The only user-owned
// slot is the cargo ID in the last two labels and it remains opaque.
const reviewLabels: Template[] = [
  literal('검토 총중량', 'Review gross weight', 'Tổng trọng lượng xem xét'),
  literal('검토 바닥하중', 'Review floor load', 'Tải sàn xem xét'),
  literal('검토 최소 지지율', 'Review minimum support ratio', 'Tỷ lệ đỡ tối thiểu xem xét'),
  literal('검토 변위', 'Review displacement', 'Độ dịch chuyển xem xét'),
  literal('검토 회전각', 'Review rotation angle', 'Góc xoay xem xét'),
  literal('{0} 검토 적층단', '{0} review stacking layers', 'Số tầng xếp xem xét của {0}'),
  literal('{0} 검토 상부하중', '{0} review top load', 'Tải trên xem xét của {0}'),
];
for (const label of reviewLabels) {
  for (const numberType of ['finite', 'integer'] as const) {
    const ko = numberType === 'integer' ? '정수' : '유한한 수';
    const en = numberType === 'integer' ? 'an integer' : 'a finite number';
    const vi = numberType === 'integer' ? 'số nguyên' : 'số hữu hạn';
    add(combine(label, literal(`: {0}~{1} 범위의 ${ko}를 입력하세요.`,
      `: enter ${en} in the range {0}–{1}.`, `: nhập ${vi} trong phạm vi {0}–{1}.`)));
    add(combine(label, literal(`: 0 초과~{0} 범위의 ${ko}를 입력하세요.`,
      `: enter ${en} greater than 0 and up to {0}.`, `: nhập ${vi} lớn hơn 0 và không vượt quá {0}.`)));
  }
}

const scenarios: Template[] = [
  literal('정적 중력', 'Static gravity', 'Trọng lực tĩnh'),
  literal('출발 가속 {0}g', 'Starting acceleration {0}g', 'Gia tốc khởi hành {0}g'),
  literal('급제동 {0}g', 'Hard braking {0}g', 'Phanh gấp {0}g'),
  literal('횡가속 {0}g', 'Lateral acceleration {0}g', 'Gia tốc ngang {0}g'),
];
for (const scenario of scenarios) {
  for (const ending of [
    literal(': 불안정 {0}개 · 주의 {1}개 감지. 재배치가 필요합니다.',
      ': detected {0} unstable items and {1} warnings. Rearrangement is required.',
      ': phát hiện {0} kiện mất ổn định và {1} kiện cần chú ý. Cần bố trí lại.'),
    literal(': 붕괴 수준의 이동은 없지만 {0}개 위치 재확인이 필요합니다.',
      ': no collapse-level movement, but {0} positions need rechecking.',
      ': không có dịch chuyển đến mức đổ sập, nhưng cần kiểm tra lại {0} vị trí.'),
    literal(': 전체 적재물이 안정적으로 유지되었습니다.', ': all loaded cargo remained stable.', ': toàn bộ hàng đã xếp vẫn ổn định.'),
  ]) add(combine(scenario, ending));
}
// classifyPhysicsMotion joins a finite, ordered set; enumerate its exact combinations.
const motionReasons: Template[] = [
  literal('컨테이너 경계 이탈', 'Outside container bounds', 'Ra ngoài ranh giới container'),
  literal('수평 이동 {0}mm', 'Horizontal movement {0}mm', 'Dịch chuyển ngang {0}mm'),
  literal('높이 변화 {0}mm', 'Height change {0}mm', 'Thay đổi độ cao {0}mm'),
  literal('기울기 {0}°', 'Tilt {0}°', 'Độ nghiêng {0}°'),
  literal('시뮬레이션 종료 시에도 움직임', 'Still moving at the end of the simulation', 'Vẫn chuyển động khi mô phỏng kết thúc'),
];
for (let mask = 1; mask < 1 << motionReasons.length; mask += 1) {
  const selected = motionReasons.filter((_, index) => mask & (1 << index));
  add(combine(...selected.flatMap((part, index) => index ? [literal(' · ', ' · ', ' · '), part] : [part])));
}

for (const zone of [
  literal('안쪽', 'Inner', 'Phía trong'), literal('중앙', 'Middle', 'Giữa'), literal('문쪽', 'Door side', 'Phía cửa'),
]) add(combine(zone, literal(' · 평균 {0}m', ' · Average {0}m', ' · Trung bình {0}m')));

const profiles: Template[] = [
  literal('전체 높이 {0}%', 'Overall height {0}%', 'Chiều cao tổng thể {0}%'),
];
for (const label of [
  literal('전체 저중심', 'Low center of gravity throughout', 'Trọng tâm thấp toàn bộ'),
  literal('중량물 저층 우선', 'Heavy cargo in lower layers first', 'Ưu tiên hàng nặng ở tầng thấp'),
  literal('고형상 저층 우선', 'Tall cargo in lower layers first', 'Ưu tiên hàng cao ở tầng thấp'),
  literal('SKU 층수 분산', 'Distribute layers across SKUs', 'Phân bố số tầng giữa các SKU'),
]) {
  const profile = combine(label, literal(' · {0}단 낮춤', ' · Lower by {0} layers', ' · Hạ {0} tầng'));
  add(profile); profiles.push(profile);
}
for (const strategy of [
  literal('안정성 우선', 'Stability first', 'Ưu tiên ổn định'),
  literal('적재율 우선', 'Utilization first', 'Ưu tiên tỷ lệ xếp'),
  literal('하역 우선', 'Unloading first', 'Ưu tiên dỡ hàng'),
]) for (const profile of profiles) add(combine(strategy, literal(' · ', ' · ', ' · '), profile));

export const uiMessagesEngine: Readonly<Record<string, readonly [string, string]>> = engineMessages;
