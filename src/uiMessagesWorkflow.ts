/** Presentation-only workflow translations: [English, Vietnamese]. */
export const uiMessagesWorkflow: Readonly<Record<string, readonly [string, string]>> = {
  "적재율 우선": [
    "Capacity first",
    "Ưu tiên sức chứa"
  ],
  "하역 우선": [
    "Unloading first",
    "Ưu tiên dỡ hàng"
  ],
  "3D 모듈 불러오는 중": [
    "Loading 3D module",
    "Đang tải mô-đun 3D"
  ],
  "잠시 후 표시됩니다.": [
    "It will appear shortly.",
    "Sẽ hiển thị sau giây lát."
  ],
  "처음 시작합니다. 컨테이너를 확인한 뒤 본인이 사용할 화물을 등록하세요.": [
    "To begin, check the container and register your cargo.",
    "Để bắt đầu, hãy kiểm tra container và đăng ký hàng hóa."
  ],
  "박스 적재 모드로 전환했습니다.": [
    "Switched to box loading mode.",
    "Đã chuyển sang chế độ xếp thùng."
  ],
  "박스 + 팔레트 혼합 적재 모드로 전환했습니다.": [
    "Switched to mixed box and pallet loading mode.",
    "Đã chuyển sang chế độ xếp hỗn hợp thùng và pallet."
  ],
  "팔레트 적재 모드로 전환했습니다.": [
    "Switched to pallet loading mode.",
    "Đã chuyển sang chế độ xếp pallet."
  ],
  "박스 직접 적재 유형을 적용했습니다.": [
    "Direct box loading selected.",
    "Đã chọn xếp thùng trực tiếp."
  ],
  "파렛트 적재 유형을 적용했습니다.": [
    "Pallet loading selected.",
    "Đã chọn xếp pallet."
  ],
  "수동 배치가 최종 안전조건을 만족하지 않아 기존 배치를 유지했습니다.": [
    "The manual layout failed final safety checks. The previous layout was retained.",
    "Bố trí thủ công không đạt kiểm tra an toàn cuối cùng. Đã giữ bố trí trước đó."
  ],
  "가져온 데이터가 현재 화면에 반영되었습니다.": [
    "Imported data is now displayed.",
    "Dữ liệu đã nhập hiện được hiển thị."
  ],
  "박스 코드·이름·치수·중량·수량·적층조건을 확인하세요. 수량은 0 이상의 정수이고 상부 허용중량은 0 이상이어야 합니다.": [
    "Check the box code, name, dimensions, weight, quantity and stacking limits. Quantity must be a nonnegative integer and permitted top load must be nonnegative.",
    "Kiểm tra mã, tên, kích thước, trọng lượng, số lượng và giới hạn xếp chồng của thùng. Số lượng phải là số nguyên không âm và tải cho phép phía trên phải không âm."
  ],
  "이미 등록된 박스 코드입니다: {0}": [
    "Box code already registered: {0}",
    "Mã thùng đã được đăng ký: {0}"
  ],
  "{0} 수정 완료 · 자동 적재를 다시 실행하세요.": [
    "{0} updated · Run automatic loading again.",
    "Đã cập nhật {0} · Hãy chạy lại xếp hàng tự động."
  ],
  "{0} 등록 완료 · 자동 적재를 실행하세요.": [
    "{0} registered · Run automatic loading.",
    "Đã đăng ký {0} · Hãy chạy xếp hàng tự động."
  ],
  "{0} 화물을 삭제했습니다.": [
    "Deleted cargo {0}.",
    "Đã xóa hàng hóa {0}."
  ],
  "한도 초과 검토는 기존 규칙의 박스 직접 적재에서만 지원합니다. 엄격 모드로 전환하거나 지원하는 적재 방식을 선택하세요.": [
    "Limit review is supported only for direct boxes under legacy rules. Switch to strict mode or select a supported loading mode.",
    "Chế độ xem xét vượt giới hạn chỉ hỗ trợ xếp thùng trực tiếp theo quy tắc cũ. Chuyển sang chế độ nghiêm ngặt hoặc chọn cách xếp được hỗ trợ."
  ],
  " 외 {0}건": [
    " and {0} more",
    " và {0} mục khác"
  ],
  "적재할 화물이 없습니다. 본인의 박스 목록에서 화물을 등록하거나 선택하세요.": [
    "No cargo to load. Register or select cargo from your box list.",
    "Không có hàng để xếp. Đăng ký hoặc chọn hàng từ danh sách thùng của bạn."
  ],
  "적재 방식을 먼저 선택해 주세요.": [
    "Select a loading method first.",
    "Hãy chọn cách xếp hàng trước."
  ],
  "팔레트 배치 후보 계산 중…": [
    "Calculating pallet layout candidates…",
    "Đang tính các phương án bố trí pallet…"
  ],
  "혼합 최적화 중 · 가득 찬 팔레트는 유지하고 저효율 잔량 팔레트는 직접 박스로 전환해 같은 EMS에서 함께 배치합니다.": [
    "Optimizing mixed loading · Full pallets are retained; low-fill residual pallets become direct boxes and share the same EMS search.",
    "Đang tối ưu xếp hỗn hợp · Giữ pallet đầy; chuyển pallet dư có độ đầy thấp thành thùng trực tiếp và bố trí cùng trong tìm kiếm EMS."
  ],
  "팔레트 최적 적재 계산 후 관성 3종을 자동 검증합니다. PASS한 적재안만 최종 결과로 엽니다.": [
    "After pallet optimization, three inertia scenarios are checked automatically. Only a PASS layout opens as the final result.",
    "Sau khi tối ưu pallet, tự động kiểm tra ba kịch bản quán tính. Chỉ phương án PASS mới được mở làm kết quả cuối."
  ],
  "후보 적재안 생성 중…": [
    "Generating loading candidates…",
    "Đang tạo các phương án xếp hàng…"
  ],
  "{0} 전략으로 물리 기반 적재 계산 중…": [
    "Calculating physics-based loading with the {0} strategy…",
    "Đang tính xếp hàng theo vật lý với chiến lược {0}…"
  ],
  "물리 기반 최적 적재 계산 중…": [
    "Calculating physics-based optimal loading…",
    "Đang tính xếp hàng tối ưu theo vật lý…"
  ],
  "후보 {0}/{1} · {2} · 물리검증 {3}%": [
    "Candidate {0}/{1} · {2} · Physics check {3}%",
    "Phương án {0}/{1} · {2} · Kiểm tra vật lý {3}%"
  ],
  "검토용 계산 완료 · {0}EA · 원 기준의 초과·실패 경고를 유지합니다. 출고 승인 불가": [
    "Review calculation complete · {0} EA · Original-limit excess and failure warnings retained. Not approved for dispatch.",
    "Đã tính xong để xem xét · {0} EA · Giữ cảnh báo vượt và không đạt giới hạn gốc. Không được phê duyệt xuất hàng."
  ],
  "자동 적재 계산 완료 · {0}EA · 길이 CG 오류가 있어 전체안과 CG 충족안 중 하나를 선택하세요.": [
    "Automatic loading calculated · {0} EA · Longitudinal CG failed. Choose the full-load or CG-compliant plan.",
    "Đã tính xếp hàng tự động · {0} EA · CG dọc không đạt. Chọn phương án đầy đủ hoặc phương án đạt CG."
  ],
  "자동 적재 계산 완료 · {0}EA · 관성 3종 최종검증 진행 중": [
    "Automatic loading calculated · {0} EA · Final checks for three inertia scenarios in progress",
    "Đã tính xếp hàng tự động · {0} EA · Đang kiểm tra cuối ba kịch bản quán tính"
  ],
  "계산 완료 · 적재 가능한 화물이 없습니다. 결과에서 미적재 사유를 확인하세요.": [
    "Calculation complete · No cargo can be loaded. Check the unplaced reasons in the results.",
    "Đã tính xong · Không thể xếp hàng nào. Xem lý do chưa xếp trong kết quả."
  ],
  "자동 적재 계산을 완료하지 못했습니다. 최종 적재 진행을 다시 눌러 주세요.": [
    "Automatic loading could not be completed. Run final loading again.",
    "Không thể hoàn tất tính xếp hàng tự động. Hãy chạy xếp hàng cuối cùng lần nữa."
  ],
  "전체 적재안 {0}EA를 선택했습니다. CG 오류를 유지한 채 관성 검증합니다.": [
    "Selected the full-load plan with {0} EA. Inertia checks will retain the CG error.",
    "Đã chọn phương án đầy đủ {0} EA. Kiểm tra quán tính sẽ giữ lỗi CG."
  ],
  "CG 충족안 {0}EA를 선택했습니다. 선택한 배치를 유지한 채 관성 검증합니다.": [
    "Selected the CG-compliant plan with {0} EA. Inertia checks will retain the selected layout.",
    "Đã chọn phương án đạt CG với {0} EA. Kiểm tra quán tính sẽ giữ bố trí đã chọn."
  ],
  "미리보기 단계입니다. 최종 적재를 실행한 뒤 결과를 확인하세요.": [
    "This is a preview. Run final loading before viewing results.",
    "Đây là bản xem trước. Chạy xếp hàng cuối cùng trước khi xem kết quả."
  ],
  "전체 적재안과 CG 충족안 중 하나를 먼저 선택하세요.": [
    "First choose the full-load or CG-compliant plan.",
    "Trước tiên hãy chọn phương án đầy đủ hoặc phương án đạt CG."
  ],
  "작업지시서 발급 전에 전체 적재안과 CG 충족안 중 하나를 선택하세요.": [
    "Choose the full-load or CG-compliant plan before issuing work instructions.",
    "Chọn phương án đầy đủ hoặc phương án đạt CG trước khi xuất hướng dẫn công việc."
  ],
  "팝업이 차단되어 작업지시서를 열지 못했습니다.": [
    "The work instructions could not open because the popup was blocked.",
    "Không thể mở hướng dẫn công việc vì cửa sổ bật lên bị chặn."
  ],
  "현재 입력과 최종 적재 결과를 저장했습니다.": [
    "Saved current inputs and final loading results.",
    "Đã lưu dữ liệu nhập và kết quả xếp hàng cuối cùng."
  ],
  "현재 작업 입력을 저장했습니다.": [
    "Saved current work inputs.",
    "Đã lưu dữ liệu nhập của công việc hiện tại."
  ],
  "저장된 데이터가 없습니다.": [
    "No saved data.",
    "Không có dữ liệu đã lưu."
  ],
  "저장된 데이터를 불러왔습니다.": [
    "Loaded saved data.",
    "Đã tải dữ liệu đã lưu."
  ],
  "등록된 화물과 저장 데이터를 모두 초기화할까요?": [
    "Reset all registered cargo and saved data?",
    "Đặt lại toàn bộ hàng đã đăng ký và dữ liệu đã lưu?"
  ],
  "현재 작업의 화물 데이터를 모두 초기화했습니다.": [
    "Reset all cargo data for the current work.",
    "Đã đặt lại toàn bộ dữ liệu hàng của công việc hiện tại."
  ],
  "남은 시간 계산 중": [
    "Estimating time remaining",
    "Đang ước tính thời gian còn lại"
  ],
  "마무리 중": [
    "Finishing up",
    "Đang hoàn tất"
  ],
  "약 {0}초 남음": [
    "About {0}s remaining",
    "Còn khoảng {0} giây"
  ],
  "컨테이너 적재 시뮬레이터": [
    "Container Loading Simulator",
    "Mô phỏng xếp hàng container"
  ],
  "주요 메뉴": [
    "Main menu",
    "Menu chính"
  ],
  "대시보드": [
    "Dashboard",
    "Bảng điều khiển"
  ],
  "3D 보기": [
    "3D view",
    "Xem 3D"
  ],
  "결과 보기": [
    "View results",
    "Xem kết quả"
  ],
  "불러오기": [
    "Load",
    "Tải"
  ],
  "저장": [
    "Save",
    "Lưu"
  ],
  "작업지시서": [
    "Work instructions",
    "Hướng dẫn công việc"
  ],
  "한도 초과 검토 모드입니다. 범위를 적용하고 다시 계산하세요. 검토 전용 표시와 원 기준 초과 경고가 유지됩니다.": [
    "Limit review mode. Apply the ranges and recalculate. Review-only labels and original-limit warnings remain.",
    "Chế độ xem xét vượt giới hạn. Áp dụng phạm vi và tính lại. Giữ nhãn chỉ để xem xét và cảnh báo vượt giới hạn gốc."
  ],
  "엄격 모드로 전환했습니다. 이전 검토 결과는 무효화되며 원 기준으로 다시 적재해야 합니다.": [
    "Switched to strict mode. Previous review results are invalidated; recalculate using the original limits.",
    "Đã chuyển sang chế độ nghiêm ngặt. Kết quả xem xét trước bị vô hiệu; hãy tính lại theo giới hạn gốc."
  ],
  "처음 사용 안내": [
    "Getting started",
    "Hướng dẫn bắt đầu"
  ],
  "처음 사용하시나요?": [
    "First time here?",
    "Lần đầu sử dụng?"
  ],
  "① 컨테이너 규격 확인 → ② 로그인 후 개인 박스 등록/선택 → ③ 물리 최적 자동 적재": [
    "① Check container dimensions → ② Sign in and register/select boxes → ③ Run physics-optimized loading",
    "① Kiểm tra kích thước container → ② Đăng nhập và đăng ký/chọn thùng → ③ Chạy xếp hàng tối ưu theo vật lý"
  ],
  "1. 컨테이너 정보": [
    "1. Container information",
    "1. Thông tin container"
  ],
  "컨테이너 규격": [
    "Container dimensions",
    "Kích thước container"
  ],
  "현재 단일 규격 · 상세 규격은 아래에서 직접 수정": [
    "One default size · Edit dimensions below",
    "Một kích thước mặc định · Sửa kích thước bên dưới"
  ],
  "내부 길이": [
    "Internal length",
    "Chiều dài bên trong"
  ],
  "내부 폭": [
    "Internal width",
    "Chiều rộng bên trong"
  ],
  "내부 높이": [
    "Internal height",
    "Chiều cao bên trong"
  ],
  "적재 용적": [
    "Loading volume",
    "Thể tích xếp hàng"
  ],
  "바닥 경고기준": [
    "Floor-load warning threshold",
    "Ngưỡng cảnh báo tải sàn"
  ],
  "상세 규격 / 직접 수정": [
    "Detailed dimensions / edit",
    "Kích thước chi tiết / chỉnh sửa"
  ],
  "최대중량": [
    "Maximum weight",
    "Trọng lượng tối đa"
  ],
  "바닥 허용하중(kg/m²)": [
    "Floor-load limit (kg/m²)",
    "Giới hạn tải sàn (kg/m²)"
  ],
  "국부하중 경고배수": [
    "Local-load warning multiplier",
    "Hệ số cảnh báo tải cục bộ"
  ],
  "2. 적재할 화물": [
    "2. Cargo to load",
    "2. Hàng cần xếp"
  ],
  "박스": [
    "Boxes",
    "Thùng"
  ],
  "혼합": [
    "Mixed",
    "Hỗn hợp"
  ],
  "등록된 화물이 없습니다.": [
    "No cargo registered.",
    "Chưa đăng ký hàng hóa."
  ],
  "로그인 후 본인의 박스 목록에서 화물을 선택하거나 새 박스를 등록하세요.": [
    "Sign in to select cargo from your box list or register new boxes.",
    "Đăng nhập để chọn hàng từ danh sách thùng hoặc đăng ký thùng mới."
  ],
  "상부허용 제한없음": [
    "No top-load limit",
    "Không giới hạn tải phía trên"
  ],
  "상부허용 {0} kg": [
    "Top-load limit {0} kg",
    "Giới hạn tải phía trên {0} kg"
  ],
  "{0} 수량 1 감소": [
    "Decrease {0} quantity by 1",
    "Giảm số lượng {0} đi 1"
  ],
  "{0} 수량 1 증가": [
    "Increase {0} quantity by 1",
    "Tăng số lượng {0} thêm 1"
  ],
  "수정": [
    "Edit",
    "Chỉnh sửa"
  ],
  "＋ 새 화물 추가": [
    "＋ Add new cargo",
    "＋ Thêm hàng mới"
  ],
  "코드": [
    "Code",
    "Mã"
  ],
  "중량(kg)": [
    "Weight (kg)",
    "Trọng lượng (kg)"
  ],
  "수량": [
    "Quantity",
    "Số lượng"
  ],
  "상부 허용중량(kg)": [
    "Permitted top load (kg)",
    "Tải cho phép phía trên (kg)"
  ],
  "제한 없음": [
    "No limit",
    "Không giới hạn"
  ],
  "회전 허용": [
    "Allow rotation",
    "Cho phép xoay"
  ],
  "수정 저장": [
    "Save changes",
    "Lưu thay đổi"
  ],
  "박스 추가": [
    "Add box",
    "Thêm thùng"
  ],
  "3. 적재 옵션": [
    "3. Loading options",
    "3. Tùy chọn xếp hàng"
  ],
  "적재 방식": [
    "Loading method",
    "Cách xếp hàng"
  ],
  "물리 검증 자동 최적화": [
    "Automatic physics-validated optimization",
    "Tự động tối ưu có kiểm tra vật lý"
  ],
  "박스 회전": [
    "Box rotation",
    "Xoay thùng"
  ],
  "품목별 허용 설정 + 자동 방향 선택": [
    "Per-item permissions + automatic orientation",
    "Quyền theo từng mặt hàng + tự động chọn hướng"
  ],
  "잔량에 대해 자동 허용": [
    "Automatically allowed for remaining cargo",
    "Tự động cho phép với hàng còn lại"
  ],
  "운송 검증": [
    "Transport checks",
    "Kiểm tra vận chuyển"
  ],
  "정적 · 출발 0.30g · 급제동 0.50g · 횡가속 0.35g": [
    "Static · Start 0.30g · Emergency braking 0.50g · Lateral 0.35g",
    "Tĩnh · Khởi hành 0.30g · Phanh gấp 0.50g · Ngang 0.35g"
  ],
  "변경 가능한 설정만 입력 컨트롤로 표시합니다. 고정 동작은 설명으로만 표시합니다.": [
    "Only adjustable settings have input controls. Fixed behavior is shown as explanatory text.",
    "Chỉ cài đặt có thể đổi mới có ô nhập. Hoạt động cố định được trình bày bằng mô tả."
  ],
  "물리 기반 최적 적재 계산 중": [
    "Calculating physics-based optimal loading",
    "Đang tính xếp hàng tối ưu theo vật lý"
  ],
  "팔레트 배치 계산 중": [
    "Calculating pallet layout",
    "Đang tính bố trí pallet"
  ],
  "후보 적재안을 만들고 있습니다.": [
    "Generating candidate loading plans.",
    "Đang tạo các phương án xếp hàng."
  ],
  "배치 완료 후 물리 안전 검증을 진행합니다": [
    "Physics safety checks follow layout calculation",
    "Kiểm tra an toàn vật lý sau khi tính bố trí"
  ],
  "선택 제품 미리보기": [
    "Selected product preview",
    "Xem trước sản phẩm đã chọn"
  ],
  "박스 적재 결과": [
    "Box loading results",
    "Kết quả xếp thùng"
  ],
  "적재공간을 확인하고 제품을 선택하세요": [
    "Check the loading space and select products",
    "Kiểm tra không gian xếp hàng và chọn sản phẩm"
  ],
  "미리보기 · {0} / {1}개 표시 · 실제 크기의 바닥 배치이며 최종 적재·안전 검증 전입니다": [
    "Preview · Showing {0} / {1} items · Actual-size floor layout, before final loading and safety checks",
    "Xem trước · Hiển thị {0} / {1} mục · Bố trí sàn đúng kích thước, chưa xếp hàng cuối và kiểm tra an toàn"
  ],
  "Rapier {0}점 · {1}": [
    "Rapier {0} points · {1}",
    "Rapier {0} điểm · {1}"
  ],
  "자동 적재 실행 시 후보를 물리 검증해 최종안을 선택합니다.": [
    "Automatic loading checks candidates with physics to select the final plan.",
    "Xếp tự động kiểm tra vật lý các phương án để chọn phương án cuối."
  ],
  "주요 작업": [
    "Main actions",
    "Thao tác chính"
  ],
  "검사 진행 중…": [
    "Checks in progress…",
    "Đang kiểm tra…"
  ],
  "4. 적재 요약": [
    "4. Loading summary",
    "4. Tóm tắt xếp hàng"
  ],
  "총 부피": [
    "Total volume",
    "Tổng thể tích"
  ],
  "사용 박스 수": [
    "Loaded boxes",
    "Số thùng đã xếp"
  ],
  "물리 안정성": [
    "Physical stability",
    "Độ ổn định vật lý"
  ],
  "{0} 점": [
    "{0} points",
    "{0} điểm"
  ],
  "검증 전": [
    "Not yet checked",
    "Chưa kiểm tra"
  ],
  "{0} 층": [
    "{0} layers",
    "{0} tầng"
  ],
  "제약 조건 실패 항목 있음": [
    "Some constraints failed",
    "Có ràng buộc không đạt"
  ],
  "현장 확인 항목 있음": [
    "Site checks required",
    "Cần kiểm tra tại hiện trường"
  ],
  "물리 최적안 선택 완료": [
    "Physics-optimal plan selected",
    "Đã chọn phương án tối ưu theo vật lý"
  ],
  "제약 조건 모두 만족": [
    "All constraints satisfied",
    "Đáp ứng mọi ràng buộc"
  ],
  "5. 제약 조건 체크": [
    "5. Constraint checks",
    "5. Kiểm tra ràng buộc"
  ],
  "6. 빠른 작업": [
    "6. Quick actions",
    "6. Thao tác nhanh"
  ],
  "물리 검증 중…": [
    "Physics checks in progress…",
    "Đang kiểm tra vật lý…"
  ],
  "물리 최적 자동 적재": [
    "Physics-optimized automatic loading",
    "Xếp tự động tối ưu theo vật lý"
  ],
  "작업 지시서": [
    "Work instructions",
    "Hướng dẫn công việc"
  ],
  "© Container Loading Simulator · v2.6.0 · 운영형 적재 설계 도구": [
    "© Container Loading Simulator · v2.6.0 · Operational load planning tool",
    "© Container Loading Simulator · v2.6.0 · Công cụ lập kế hoạch xếp hàng vận hành"
  ],
  "팔레트 {0} 상세": [
    "Pallet {0} details",
    "Chi tiết pallet {0}"
  ],
  "AUTO-PALLET-{0} 적재 정보": [
    "AUTO-PALLET-{0} loading information",
    "Thông tin xếp hàng AUTO-PALLET-{0}"
  ],
  "{0}열 · {1}단": [
    "Column {0} · Level {1}",
    "Cột {0} · Tầng {1}"
  ],
  "총 적재수량": [
    "Total loaded quantity",
    "Tổng số lượng đã xếp"
  ],
  "팔레트 규격": [
    "Pallet dimensions",
    "Kích thước pallet"
  ],
  "이 팔레트의 박스 적층 제한": [
    "Box stacking limits for this pallet",
    "Giới hạn xếp chồng thùng trên pallet này"
  ],
  "위로 더 쌓을 수 없는 박스": [
    "Boxes that cannot support more cargo",
    "Thùng không thể chịu thêm hàng phía trên"
  ],
  "현재 적용된 제한입니다. 박스 관리에서 실제 허용하중·최대 적층단을 확인한 뒤 포장 확정과 자동 적재를 다시 실행하세요.": [
    "These are the active limits. Verify actual permitted loads and maximum stacking levels in box management, then confirm packaging and rerun automatic loading.",
    "Đây là giới hạn đang áp dụng. Kiểm tra tải cho phép thực tế và số tầng tối đa trong quản lý thùng, sau đó xác nhận đóng gói và chạy lại xếp tự động."
  ],
  "팔레트 속 내용": [
    "Pallet contents",
    "Hàng trên pallet"
  ],
  "화물중량 {0}kg": [
    "Cargo weight {0}kg",
    "Trọng lượng hàng {0}kg"
  ],
  "팔레트/포장 {0}kg": [
    "Pallet/packaging {0}kg",
    "Pallet/bao bì {0}kg"
  ],
  "A 규칙 계산 오류": [
    "A-rules calculation error",
    "Lỗi tính toán quy tắc A"
  ],
  "박스 + 팔레트 혼합 적재": [
    "Mixed box and pallet loading",
    "Xếp hỗn hợp thùng và pallet"
  ],
  "팔레트 적재 정보": [
    "Pallet loading information",
    "Thông tin xếp pallet"
  ],
  "적재 요약": [
    "Loading summary",
    "Tóm tắt xếp hàng"
  ],
  "화물": [
    "Cargo",
    "Hàng hóa"
  ],
  "중량": [
    "Weight",
    "Trọng lượng"
  ],
  "배치": [
    "Layout",
    "Bố trí"
  ],
  "{0}단 · 바닥 {1}열": [
    "{0} levels · {1} floor columns",
    "{0} tầng · {1} cột trên sàn"
  ],
  "안쪽": [
    "Inner end",
    "Phía trong"
  ],
  "좌측": [
    "Left",
    "Trái"
  ],
  "우측": [
    "Right",
    "Phải"
  ],
  "천장": [
    "Ceiling",
    "Trần"
  ],
  "관성 보강 적용": [
    "Inertia reinforcement applied",
    "Đã áp dụng gia cố chống quán tính"
  ],
  "밴딩 {0}줄": [
    "{0} straps",
    "{0} dây đai"
  ],
  "각대 {0}EA": [
    "{0} EA corner protectors",
    "{0} EA nẹp góc"
  ],
  "랩핑 {0}m": [
    "{0}m wrap",
    "{0}m màng quấn"
  ],
  "미끄럼방지 {0}EA": [
    "{0} EA anti-slip pads",
    "{0} EA tấm chống trượt"
  ],
  "고정바 {0}EA": [
    "{0} EA load bars",
    "{0} EA thanh chặn"
  ],
  "직접 적재 박스": [
    "Direct-loaded boxes",
    "Thùng xếp trực tiếp"
  ],
  "혼합 절감 팔레트": [
    "Pallets saved by mixed loading",
    "Pallet tiết kiệm nhờ xếp hỗn hợp"
  ],
  "총 팔레트화 중량": [
    "Total palletized weight",
    "Tổng trọng lượng hàng trên pallet"
  ],
  "전역 최적화": [
    "Global optimization",
    "Tối ưu toàn cục"
  ],
  "{0}단 후보 · 바닥 {1}열": [
    "{0}-level candidate · {1} floor columns",
    "Phương án {0} tầng · {1} cột trên sàn"
  ],
  "재배치 / 병합": [
    "Redistribution / consolidation",
    "Phân bố lại / gộp"
  ],
  "{0} · {1}회": [
    "{0} · {1} passes",
    "{0} · {1} lượt"
  ],
  "관성 보강": [
    "Inertia reinforcement",
    "Gia cố chống quán tính"
  ],
  "결과 보기 전 검증": [
    "Checked before viewing results",
    "Kiểm tra trước khi xem kết quả"
  ],
  "보조자재 중량": [
    "Securing material weight",
    "Trọng lượng vật liệu phụ trợ"
  ],
  "약 {0} kg": [
    "About {0} kg",
    "Khoảng {0} kg"
  ],
  "관성 PASS가 나올 때까지 팔레트 위치와 팔레트 위 상자 적재법을 바꿉니다.": [
    "Adjusting pallet positions and box arrangements until inertia checks PASS.",
    "Điều chỉnh vị trí pallet và cách xếp thùng đến khi kiểm tra quán tính đạt PASS."
  ],
  "현재 팔레트 적재 결과를 찾지 못했습니다. 팔레트 최적 적재를 먼저 실행하세요.": [
    "No current pallet loading result found. Run pallet loading optimization first.",
    "Không tìm thấy kết quả xếp pallet hiện tại. Hãy chạy tối ưu xếp pallet trước."
  ],
  "자동 재배치 중 사용자가 적재안을 변경해 탐색을 중단했습니다. 현재 팔레트안으로 결과 보기를 다시 실행하세요.": [
    "The search stopped because the loading plan changed during automatic rearrangement. View results again for the current pallet plan.",
    "Đã dừng tìm kiếm vì phương án xếp hàng thay đổi trong khi tự động bố trí lại. Hãy xem lại kết quả cho phương án pallet hiện tại."
  ],
  "팔레트 재배치 {0}/{1} · {2}": [
    "Pallet rearrangement {0}/{1} · {2}",
    "Bố trí lại pallet {0}/{1} · {2}"
  ],
  "최종 PASS · {0}": [
    "Final PASS · {0}",
    "PASS cuối cùng · {0}"
  ],
  "유효 팔레트 배치 전부 탐색 · 가장 안전한 실패안 적용 · {0}": [
    "All valid pallet layouts searched · Safest failed plan applied · {0}",
    "Đã tìm mọi bố trí pallet hợp lệ · Áp dụng phương án không đạt an toàn nhất · {0}"
  ],
  "화물 수량과 제약조건을 유지하면서 만들 수 있는 팔레트 위치·팔레트 위 상자 방향·높이 조합을 모두 시험했지만 관성 3종 PASS가 나오지 않았습니다. 결과 보기는 잠금 상태를 유지합니다.": [
    "All feasible combinations of pallet position, box orientation and height were tested without changing cargo quantity or constraints, but none passed all three inertia scenarios. Results remain locked.",
    "Đã thử mọi tổ hợp khả thi của vị trí pallet, hướng thùng và chiều cao, giữ nguyên số lượng hàng và ràng buộc, nhưng không tổ hợp nào đạt cả ba kịch bản quán tính. Kết quả vẫn bị khóa."
  ],
  "팔레트 결과보기 전 반복 재배치": [
    "Iterative pallet rearrangement before results",
    "Lặp bố trí lại pallet trước khi xem kết quả"
  ],
  "PASS가 나올 때까지 팔레트 위치뿐 아니라 팔레트 위 상자의 방향·높이·적층단까지 바꾸어 관성 3종을 다시 시험합니다.": [
    "Retest three inertia scenarios while varying pallet positions, box orientations, height and stacking levels until PASS.",
    "Kiểm tra lại ba kịch bản quán tính khi thay đổi vị trí pallet, hướng thùng, chiều cao và số tầng đến khi PASS."
  ],
  "유효 배치 {0}/{1} · 탐색 {2}%": [
    "Valid layout {0}/{1} · Search {2}%",
    "Bố trí hợp lệ {0}/{1} · Tìm kiếm {2}%"
  ],
  "후보 생성 중": [
    "Generating candidates",
    "Đang tạo phương án"
  ],
  "현재 보강": [
    "Current reinforcement",
    "Gia cố hiện tại"
  ],
  "보강 물리 시나리오": [
    "Reinforced physics scenario",
    "Kịch bản vật lý có gia cố"
  ],
  "관성 시나리오": [
    "Inertia scenario",
    "Kịch bản quán tính"
  ],
  "물리 계산": [
    "Physics calculation",
    "Tính toán vật lý"
  ],
  "종료 조건": [
    "Stop condition",
    "Điều kiện dừng"
  ],
  "첫 PASS 또는 유효 배치 소진": [
    "First PASS or all valid layouts exhausted",
    "PASS đầu tiên hoặc hết bố trí hợp lệ"
  ],
  "계속 바꾸는 항목": [
    "Parameters being varied",
    "Thông số đang thay đổi"
  ],
  "화물 수량은 변경하지 않음": [
    "Cargo quantity stays unchanged",
    "Giữ nguyên số lượng hàng"
  ],
  "{0}개 유효 배치": [
    "{0} valid layouts",
    "{0} bố trí hợp lệ"
  ],
  "팔레트 위 방향": [
    "Orientation on pallet",
    "Hướng trên pallet"
  ],
  "자동/정방향/90도/교차": [
    "Auto/normal/90°/alternating",
    "Tự động/bình thường/90°/xen kẽ"
  ],
  "회전 가능한 SKU만 변경": [
    "Only rotatable SKUs are changed",
    "Chỉ đổi SKU cho phép xoay"
  ],
  "유닛 높이": [
    "Unit-load height",
    "Chiều cao đơn vị hàng"
  ],
  "낮은 적재부터 순차 시험": [
    "Test from lower layouts upward",
    "Thử từ bố trí thấp lên cao"
  ],
  "1단부터": [
    "Starting at 1 level",
    "Bắt đầu từ 1 tầng"
  ],
  "허용 범위의 모든 적층단 비교": [
    "Compare all permitted stacking levels",
    "So sánh mọi số tầng được phép"
  ],
  "컨테이너 폭": [
    "Container width",
    "Chiều rộng container"
  ],
  "2열 우선": [
    "Prefer 2 columns",
    "Ưu tiên 2 cột"
  ],
  "가능하면 좌우 동시 배치": [
    "Place on both sides when feasible",
    "Bố trí hai bên khi khả thi"
  ],
  "길이 방향": [
    "Longitudinal direction",
    "Hướng dọc"
  ],
  "안쪽/문쪽 밀착": [
    "Flush with inner end/door end",
    "Sát phía trong/phía cửa"
  ],
  "이동 여유가 다른 후보 비교": [
    "Compare candidates with different movement clearance",
    "So sánh phương án có khoảng trống di chuyển khác nhau"
  ],
  "승인": [
    "Approval",
    "Phê duyệt"
  ],
  "관성 3종 PASS": [
    "Three inertia scenarios PASS",
    "Ba kịch bản quán tính PASS"
  ],
  "PASS 전 결과 잠금": [
    "Results locked until PASS",
    "Khóa kết quả đến khi PASS"
  ],
  "결과보기 잠금 유지": [
    "Results remain locked",
    "Kết quả vẫn bị khóa"
  ],
  "팔레트 적재 요약": [
    "Pallet loading summary",
    "Tóm tắt xếp pallet"
  ],
  "전체 적재안과 CG 충족안 선택": [
    "Choose full-load or CG-compliant plan",
    "Chọn phương án đầy đủ hoặc đạt CG"
  ],
  "길이 방향 무게중심 선택 필요": [
    "Longitudinal center-of-gravity decision required",
    "Cần chọn phương án trọng tâm dọc"
  ],
  "전체 수량을 유지할지, 일부를 제외해 CG 허용범위를 맞출지 선택하세요.": [
    "Choose whether to keep the full quantity or remove some cargo to meet the CG range.",
    "Chọn giữ toàn bộ số lượng hoặc loại bớt hàng để đạt phạm vi CG."
  ],
  "선택 후 관성 최종검증 진행": [
    "Final inertia checks follow your choice",
    "Kiểm tra quán tính cuối sau khi chọn"
  ],
  "전체 적재안": [
    "Full-load plan",
    "Phương án đầy đủ"
  ],
  "길이 CG": [
    "Longitudinal CG",
    "CG dọc"
  ],
  "오류 표시 유지": [
    "Error remains visible",
    "Giữ hiển thị lỗi"
  ],
  "편차 / 허용": [
    "Deviation / allowance",
    "Độ lệch / cho phép"
  ],
  "총 운송중량": [
    "Total transport weight",
    "Tổng trọng lượng vận chuyển"
  ],
  "제외 수량": [
    "Excluded quantity",
    "Số lượng loại ra"
  ],
  "전체 적재안 선택": [
    "Choose full-load plan",
    "Chọn phương án đầy đủ"
  ],
  "CG 충족안": [
    "CG-compliant plan",
    "Phương án đạt CG"
  ],
  "허용범위 이내": [
    "Within permitted range",
    "Trong phạm vi cho phép"
  ],
  "제외 품목": [
    "Excluded items",
    "Mặt hàng loại ra"
  ],
  "CG 충족안 선택": [
    "Choose CG-compliant plan",
    "Chọn phương án đạt CG"
  ],
  "전체 적재안을 선택하면 CG 오류를 숨기지 않고 결과와 작업지시서에 유지합니다. CG 충족안을 선택하면 제외 수량을 CG_LIMIT으로 기록합니다.": [
    "The full-load plan keeps the CG error visible in results and work instructions. The CG-compliant plan records excluded quantities as CG_LIMIT.",
    "Phương án đầy đủ giữ lỗi CG trong kết quả và hướng dẫn công việc. Phương án đạt CG ghi số lượng loại ra bằng mã CG_LIMIT."
  ],
  "10. 적재 전략 비교": [
    "10. Compare loading strategies",
    "10. So sánh chiến lược xếp hàng"
  ],
  "추천 {0}안": [
    "Recommended plan {0}",
    "Đề xuất phương án {0}"
  ],
  "같은 화물을 3가지 목표로 다시 계산합니다. 추천 점수는 모든 안에 동일한 평가식을 적용한 의사결정 보조값입니다.": [
    "Recalculate the same cargo for three objectives. Recommendation scores use the same formula for every plan as a decision aid.",
    "Tính lại cùng lô hàng theo ba mục tiêu. Điểm đề xuất dùng cùng công thức cho mọi phương án để hỗ trợ quyết định."
  ],
  "하역 순서 닫기": [
    "Close unloading order",
    "Đóng thứ tự dỡ hàng"
  ],
  "하역 순서 설정": [
    "Set unloading order",
    "Đặt thứ tự dỡ hàng"
  ],
  "하역 순서": [
    "Unloading order",
    "Thứ tự dỡ hàng"
  ],
  "1 = 가장 먼저 꺼냄(문쪽) · 숫자가 클수록 나중에 꺼냄(안쪽)": [
    "1 = unload first (door end) · Higher numbers unload later (inner end)",
    "1 = dỡ đầu tiên (phía cửa) · Số lớn hơn dỡ sau (phía trong)"
  ],
  "다중 컨테이너 계획 닫기": [
    "Close multi-container plan",
    "Đóng kế hoạch nhiều container"
  ],
  "필요 컨테이너 대수 계산": [
    "Calculate containers needed",
    "Tính số container cần"
  ],
  "{0}대로 전체 적재 가능": [
    "All cargo fits in {0} containers",
    "Toàn bộ hàng vừa trong {0} container"
  ],
  "{0}대 계산 후 잔량 존재": [
    "Cargo remains after planning {0} containers",
    "Còn hàng sau khi lập kế hoạch {0} container"
  ],
  "총 {0}/{1} EA 적재 · 잔량 {2} EA": [
    "Loaded {0}/{1} EA total · Remaining {2} EA",
    "Đã xếp tổng {0}/{1} EA · Còn {2} EA"
  ],
  "{0}호 컨테이너": [
    "Container {0}",
    "Container {0}"
  ],
  "부피 {0}% · 중량 {1}% · 다음 잔량 {2} EA": [
    "Volume {0}% · Weight {1}% · Remaining afterward {2} EA",
    "Thể tích {0}% · Trọng lượng {1}% · Còn lại sau đó {2} EA"
  ],
  "{0}점": [
    "{0} points",
    "{0} điểm"
  ],
  "수량 적재율": [
    "Quantity loaded",
    "Tỷ lệ số lượng đã xếp"
  ],
  "안정성": [
    "Stability",
    "Độ ổn định"
  ],
  "최대 바닥하중": [
    "Maximum floor load",
    "Tải sàn tối đa"
  ],
  "하역 편의": [
    "Unloading ease",
    "Mức thuận tiện dỡ hàng"
  ],
  "순서 미설정": [
    "Order not set",
    "Chưa đặt thứ tự"
  ],
  "현재 적용 중": [
    "Currently applied",
    "Đang áp dụng"
  ],
  "이 전략 적용": [
    "Apply this strategy",
    "Áp dụng chiến lược này"
  ],
  "12. 빈 공간 추가 적재 추천": [
    "12. Additional loading suggestions",
    "12. Đề xuất xếp thêm vào chỗ trống"
  ],
  "{0}개 후보": [
    "{0} candidates",
    "{0} phương án"
  ],
  "현재 배치를 고정한 상태에서 실제 충돌·지지·적층·상부하중·중량 제한을 다시 검사해 추가 가능 수량을 계산합니다.": [
    "With the current layout fixed, recheck collision, support, stacking, top load and weight limits to calculate additional capacity.",
    "Giữ bố trí hiện tại, kiểm tra lại va chạm, đỡ, xếp chồng, tải phía trên và giới hạn trọng lượng để tính sức chứa thêm."
  ],
  "현재 미적재 화물 {0}EA가 있습니다. 추가 출하보다 기존 미적재 해결이 우선입니다.": [
    "{0} EA remain unplaced. Resolve the existing unplaced cargo before adding more shipments.",
    "Còn {0} EA chưa xếp. Ưu tiên giải quyết hàng chưa xếp hiện tại trước khi thêm hàng xuất."
  ],
  "등록된 품목 중 현재 빈 공간에 안전하게 추가할 수 있는 후보를 찾지 못했습니다.": [
    "No registered items could be safely added to the current free space.",
    "Không tìm thấy mặt hàng đã đăng ký có thể thêm an toàn vào chỗ trống hiện tại."
  ],
  "추가 부피": [
    "Additional volume",
    "Thể tích thêm"
  ],
  "추가 중량": [
    "Additional weight",
    "Trọng lượng thêm"
  ],
  "예상 적재율": [
    "Projected utilization",
    "Tỷ lệ sử dụng dự kiến"
  ],
  "배치 구역": [
    "Placement zone",
    "Vùng bố trí"
  ],
  "첫 추가 위치 X {0} · Y {1} · Z {2}m": [
    "First added position X {0} · Y {1} · Z {2}m",
    "Vị trí thêm đầu tiên X {0} · Y {1} · Z {2}m"
  ],
  "추천 수량을 화물에 반영": [
    "Add suggested quantity to cargo",
    "Thêm số lượng đề xuất vào hàng"
  ],
  "※ 추천 수량은 현재 등록된 품목 규격을 기준으로 한 시뮬레이션입니다. 실제 출하 추가 결정 전 현장 안전조건을 다시 확인하세요.": [
    "※ Suggested quantities are simulated from registered item dimensions. Recheck on-site safety before deciding to add an actual shipment.",
    "※ Số lượng đề xuất được mô phỏng theo kích thước mặt hàng đã đăng ký. Kiểm tra lại an toàn hiện trường trước khi quyết định thêm hàng thực tế."
  ],
  "드래그 위치": [
    "Dragged position",
    "Vị trí kéo"
  ],
  "3D 드래그 위치를 검사 중입니다.": [
    "Checking the 3D dragged position.",
    "Đang kiểm tra vị trí kéo trong 3D."
  ],
  "{0} 후보로 자동 스냅했습니다.": [
    "Automatically snapped to the {0} candidate.",
    "Đã tự động bắt dính vào phương án {0}."
  ],
  "주변에 안전한 스마트 스냅 후보가 없어 원래 위치를 검사합니다.": [
    "No safe smart-snap candidate nearby. Checking the original position.",
    "Không có phương án bắt dính thông minh an toàn gần đó. Đang kiểm tra vị trí gốc."
  ],
  "위 화물을 지지하는 박스는 먼저 이동할 수 없습니다.": [
    "A box supporting cargo above cannot be moved first.",
    "Không thể di chuyển trước thùng đang đỡ hàng phía trên."
  ],
  "지지 중인 하부 박스라 드래그 이동할 수 없습니다.": [
    "This lower box supports other cargo and cannot be dragged.",
    "Thùng dưới này đang đỡ hàng khác nên không thể kéo."
  ],
  "안전조건을 만족하지 않아 이동을 취소했습니다.": [
    "Move cancelled because safety conditions were not met.",
    "Đã hủy di chuyển vì không đáp ứng điều kiện an toàn."
  ],
  "{0} 위치로 스마트 스냅 이동을 적용했습니다.": [
    "Applied a smart-snap move to {0}.",
    "Đã áp dụng di chuyển bắt dính thông minh đến {0}."
  ],
  "3D 드래그 이동을 적용했습니다. 모든 분석값을 다시 계산했습니다.": [
    "3D drag move applied. All analysis values recalculated.",
    "Đã áp dụng kéo di chuyển 3D. Đã tính lại toàn bộ giá trị phân tích."
  ],
  "수동 이동을 적용했습니다. 모든 분석값을 다시 계산했습니다.": [
    "Manual move applied. All analysis values recalculated.",
    "Đã áp dụng di chuyển thủ công. Đã tính lại toàn bộ giá trị phân tích."
  ],
  "{0}개 박스 블록 이동을 적용했습니다. 모든 분석값을 다시 계산했습니다.": [
    "Moved a block of {0} boxes. All analysis values recalculated.",
    "Đã di chuyển khối {0} thùng. Đã tính lại toàn bộ giá trị phân tích."
  ],
  "마지막 수동 이동을 취소했습니다.": [
    "Last manual move undone.",
    "Đã hoàn tác lần di chuyển thủ công cuối."
  ],
  "수동 편집을 지우고 자동 적재 결과로 복귀했습니다.": [
    "Manual edits cleared; automatic loading result restored.",
    "Đã xóa chỉnh sửa thủ công và khôi phục kết quả xếp tự động."
  ],
  "수동 적재 편집": [
    "Manual loading editor",
    "Chỉnh sửa xếp hàng thủ công"
  ],
  "3D에서 박스를 선택하세요": [
    "Select a box in 3D",
    "Chọn một thùng trong 3D"
  ],
  "↶ 실행취소": [
    "↶ Undo",
    "↶ Hoàn tác"
  ],
  "자동배치 복귀": [
    "Restore automatic layout",
    "Khôi phục bố trí tự động"
  ],
  "묶음 선택": [
    "Group selection",
    "Chọn nhóm"
  ],
  "같은 품목": [
    "Same item",
    "Cùng mặt hàng"
  ],
  "같은 행": [
    "Same row",
    "Cùng hàng"
  ],
  "같은 층": [
    "Same layer",
    "Cùng tầng"
  ],
  "{0}개 선택": [
    "{0} selected",
    "Đã chọn {0}"
  ],
  "선택된 박스의 상대 위치를 유지한 채 블록 전체를 이동합니다. 다른 박스를 받치고 있으면 이동이 차단됩니다.": [
    "Move the whole block while preserving relative box positions. Movement is blocked if it supports other boxes.",
    "Di chuyển toàn bộ khối, giữ vị trí tương đối giữa các thùng. Chặn di chuyển nếu khối đang đỡ thùng khác."
  ],
  "✓ {0}개 블록 이동 가능": [
    "✓ Block of {0} boxes can move",
    "✓ Có thể di chuyển khối {0} thùng"
  ],
  "✕ 블록 이동 불가": [
    "✕ Block cannot move",
    "✕ Không thể di chuyển khối"
  ],
  "상대 위치 유지 · 5cm 스냅 · 전체 안전검사": [
    "Relative positions preserved · 5cm snap · Full safety checks",
    "Giữ vị trí tương đối · Bắt dính 5cm · Kiểm tra an toàn đầy đủ"
  ],
  "품질점수": [
    "Quality score",
    "Điểm chất lượng"
  ],
  "무게중심 X": [
    "Center of gravity X",
    "Trọng tâm X"
  ],
  "선택 블록 이동 적용": [
    "Apply selected block move",
    "Áp dụng di chuyển khối đã chọn"
  ],
  "🔒 위 화물을 지지하는 박스입니다. 상부 박스를 먼저 이동하세요.": [
    "🔒 This box supports cargo above. Move the upper boxes first.",
    "🔒 Thùng này đỡ hàng phía trên. Hãy di chuyển thùng phía trên trước."
  ],
  "✦ 스마트 스냅 · {0}": [
    "✦ Smart snap · {0}",
    "✦ Bắt dính thông minh · {0}"
  ],
  "✓ 이동 가능": [
    "✓ Move allowed",
    "✓ Có thể di chuyển"
  ],
  "✕ 이동 불가": [
    "✕ Move blocked",
    "✕ Không thể di chuyển"
  ],
  "5cm 스냅 · 스마트 스냅 · 실시간 안전검사": [
    "5cm snap · Smart snap · Live safety checks",
    "Bắt dính 5cm · Bắt dính thông minh · Kiểm tra an toàn trực tiếp"
  ],
  "이 위치로 이동 적용": [
    "Apply move to this position",
    "Áp dụng di chuyển đến vị trí này"
  ],
  "안전조건을 만족하지 않습니다.": [
    "Safety conditions are not met.",
    "Không đáp ứng điều kiện an toàn."
  ],
  "{0}개 블록을 추천 위치로 이동했습니다.": [
    "Moved the {0}-box block to the suggested position.",
    "Đã di chuyển khối {0} thùng đến vị trí đề xuất."
  ],
  "블록 추천 이동": [
    "Suggested block moves",
    "Đề xuất di chuyển khối"
  ],
  "안전한 빈 공간 후보 TOP 3": [
    "Top 3 safe free-space candidates",
    "3 phương án chỗ trống an toàn tốt nhất"
  ],
  "3D에서 기준 박스를 선택하면 블록 이동 후보를 계산합니다.": [
    "Select a reference box in 3D to calculate candidate block moves.",
    "Chọn thùng tham chiếu trong 3D để tính các phương án di chuyển khối."
  ],
  "{0} · {1}개": [
    "{0} · {1} items",
    "{0} · {1} mục"
  ],
  "상대 위치 유지 · 충돌/지지/적층/하중 검증": [
    "Relative positions preserved · Collision/support/stacking/load checks",
    "Giữ vị trí tương đối · Kiểm tra va chạm/đỡ/xếp chồng/tải"
  ],
  "품질 {0}점 · 최대 {1} kg/m² · 중심X {2}m": [
    "Quality {0} points · Max {1} kg/m² · Center X {2}m",
    "Chất lượng {0} điểm · Tối đa {1} kg/m² · Tâm X {2}m"
  ],
  "이 위치 적용": [
    "Apply this position",
    "Áp dụng vị trí này"
  ],
  "현재 블록을 안전하게 통째로 옮길 후보를 찾지 못했습니다.": [
    "No safe whole-block move found for the current block.",
    "Không tìm thấy phương án an toàn để di chuyển toàn bộ khối hiện tại."
  ],
  "↶ 블록 드래그 취소": [
    "↶ Undo block drag",
    "↶ Hoàn tác kéo khối"
  ],
  "자동 보정 이력": [
    "Automatic correction history",
    "Lịch sử hiệu chỉnh tự động"
  ],
  "{0}건": [
    "{0} records",
    "{0} bản ghi"
  ],
  "자동 재배치 없음": [
    "No automatic rearrangements",
    "Không có bố trí lại tự động"
  ],
  "보정 점수 {0} → {1}": [
    "Correction score {0} → {1}",
    "Điểm hiệu chỉnh {0} → {1}"
  ],
  "작업 순서 시뮬레이션": [
    "Work sequence simulation",
    "Mô phỏng trình tự công việc"
  ],
  "{0} · {1}단계": [
    "{0} · {1} steps",
    "{0} · {1} bước"
  ],
  "하역": [
    "Unload",
    "Dỡ hàng"
  ],
  "현장 완료 {0}/{1}": [
    "Completed on site {0}/{1}",
    "Đã hoàn thành tại hiện trường {0}/{1}"
  ],
  "체크 초기화": [
    "Reset checklist",
    "Đặt lại danh sách kiểm tra"
  ],
  "하역 우선순위 {0}": [
    "Unloading priority {0}",
    "Ưu tiên dỡ hàng {0}"
  ],
  "✓ 완료됨": [
    "✓ Completed",
    "✓ Đã hoàn thành"
  ],
  "완료 체크": [
    "Mark complete",
    "Đánh dấu hoàn thành"
  ],
  "처음": [
    "First",
    "Đầu tiên"
  ],
  "이전": [
    "Previous",
    "Trước"
  ],
  "▶ 재생": [
    "▶ Play",
    "▶ Phát"
  ],
  "다음": [
    "Next",
    "Tiếp"
  ],
  "메움재 계획": [
    "Void-fill plan",
    "Kế hoạch chèn lấp"
  ],
  "빈 공간 메움·버팀 계획": [
    "Void filling and bracing plan",
    "Kế hoạch chèn lấp và chống đỡ"
  ],
  "VOID_FILL_REQUIRED · 위치와 자재를 현장에서 확인하세요.": [
    "VOID_FILL_REQUIRED · Verify locations and materials on site.",
    "VOID_FILL_REQUIRED · Kiểm tra vị trí và vật liệu tại hiện trường."
  ],
  "위치 {0}/{1}/{2}m · 크기 {3}/{4}/{5}m": [
    "Position {0}/{1}/{2}m · Size {3}/{4}/{5}m",
    "Vị trí {0}/{1}/{2}m · Kích thước {3}/{4}/{5}m"
  ],
  "계획 적용 범위": [
    "Within plan scope",
    "Trong phạm vi kế hoạch"
  ],
  "적용 범위 밖 · 자재 미확정": [
    "Outside scope · Material unconfirmed",
    "Ngoài phạm vi · Chưa xác nhận vật liệu"
  ],
  "후면": [
    "Rear",
    "Phía sau"
  ],
  "옆면": [
    "Side",
    "Bên hông"
  ],
  "3D 무게분포 {0}": [
    "3D weight distribution {0}",
    "Phân bố trọng lượng 3D {0}"
  ],
  "박스 기준 팔레트 3D 무게 분포": [
    "Box-based pallet 3D weight distribution",
    "Phân bố trọng lượng 3D pallet theo thùng"
  ],
  "팔레트 무게분포": [
    "Pallet weight distribution",
    "Phân bố trọng lượng pallet"
  ],
  "박스 기준 무게분포": [
    "Box-based weight distribution",
    "Phân bố trọng lượng theo thùng"
  ],
  "팔레트 자체중량 제외 · 실제 박스 중량/위치 · 20×8 바닥 격자": [
    "Excludes pallet tare · Actual box weights/positions · 20×8 floor grid",
    "Không gồm tự trọng pallet · Trọng lượng/vị trí thùng thực tế · Lưới sàn 20×8"
  ],
  "팔레트 위 박스 적재 결과가 없습니다.": [
    "No loaded-box results for the pallets.",
    "Chưa có kết quả xếp thùng trên pallet."
  ],
  "화물을 등록한 뒤 자동 적재를 실행하면 박스 기준 무게분포가 표시됩니다.": [
    "Register cargo and run automatic loading to display box-based weight distribution.",
    "Đăng ký hàng và chạy xếp tự động để hiển thị phân bố trọng lượng theo thùng."
  ],
  "중앙": [
    "Center",
    "Giữa"
  ],
  "분포 양호": [
    "Distribution good",
    "Phân bố tốt"
  ],
  "분포 확인": [
    "Check distribution",
    "Kiểm tra phân bố"
  ],
  "데이터 없음": [
    "No data",
    "Không có dữ liệu"
  ],
  "3D 무게 분포 분석": [
    "3D weight distribution analysis",
    "Phân tích phân bố trọng lượng 3D"
  ],
  "3D 무게 분포": [
    "3D weight distribution",
    "Phân bố trọng lượng 3D"
  ],
  "20 × 8 바닥 격자 · 컨테이너 중심 L/2, W/2 기준": [
    "20 × 8 floor grid · Relative to container center L/2, W/2",
    "Lưới sàn 20 × 8 · Theo tâm container L/2, W/2"
  ],
  "총 투영 중량": [
    "Total projected weight",
    "Tổng trọng lượng chiếu xuống sàn"
  ],
  "모든 적재층 포함": [
    "Includes all loaded layers",
    "Bao gồm mọi tầng đã xếp"
  ],
  "최대 국부하중": [
    "Maximum local load",
    "Tải cục bộ tối đa"
  ],
  "kg/m² · 설정 경고 {0}": [
    "kg/m² · Warning threshold {0}",
    "kg/m² · Ngưỡng cảnh báo {0}"
  ],
  "화물 CG · 길이": [
    "Cargo CG · Length",
    "CG hàng · Dọc"
  ],
  "컨테이너 L/2 기준 편차": [
    "Offset from container L/2",
    "Độ lệch so với L/2 container"
  ],
  "화물 CG · 좌우": [
    "Cargo CG · Lateral",
    "CG hàng · Ngang"
  ],
  "컨테이너 W/2 기준 · 높이 {0} mm": [
    "Relative to container W/2 · Height {0} mm",
    "Theo W/2 container · Cao {0} mm"
  ],
  "안쪽 {0}": [
    "Inner end {0}",
    "Phía trong {0}"
  ],
  "{0} 문쪽": [
    "{0} door end",
    "{0} phía cửa"
  ],
  "좌측 {0}": [
    "Left {0}",
    "Trái {0}"
  ],
  "{0} 우측": [
    "{0} right",
    "{0} phải"
  ],
  "낮음": [
    "Low",
    "Thấp"
  ],
  "높음": [
    "High",
    "Cao"
  ],
  "적재된 화물이 없어 무게 분포를 계산할 수 없습니다.": [
    "No cargo is loaded, so weight distribution cannot be calculated.",
    "Chưa xếp hàng nên không thể tính phân bố trọng lượng."
  ],
  "안쪽/문쪽 중량이 60:40 범위 안에 있습니다.": [
    "Inner/door-end weights are within the 60:40 range.",
    "Trọng lượng phía trong/phía cửa nằm trong phạm vi 60:40."
  ],
  "안쪽/문쪽 한쪽에 총중량의 {0}%가 집중되어 있습니다.": [
    "{0}% of total weight is concentrated at one longitudinal end.",
    "{0}% tổng trọng lượng tập trung ở một đầu dọc."
  ],
  "좌/우 중량이 60:40 범위 안에 있습니다.": [
    "Left/right weights are within the 60:40 range.",
    "Trọng lượng trái/phải nằm trong phạm vi 60:40."
  ],
  "좌/우 한쪽에 총중량의 {0}%가 집중되어 있습니다.": [
    "{0}% of total weight is concentrated on one lateral side.",
    "{0}% tổng trọng lượng tập trung ở một bên ngang."
  ],
  "최대 국부하중 {0} kg/m²가 현재 설정 경고기준 {1} kg/m²를 넘습니다.": [
    "Maximum local load {0} kg/m² exceeds the current warning threshold of {1} kg/m².",
    "Tải cục bộ tối đa {0} kg/m² vượt ngưỡng cảnh báo hiện tại {1} kg/m²."
  ],
  "최대 국부하중이 현재 설정 경고기준 {0} kg/m² 이내입니다.": [
    "Maximum local load is within the current warning threshold of {0} kg/m².",
    "Tải cục bộ tối đa nằm trong ngưỡng cảnh báo hiện tại {0} kg/m²."
  ],
  "공간 활용형": [
    "Space utilization",
    "Tận dụng không gian"
  ],
  "동일 SKU 블록 + 최대 빈 공간 + Beam Search로 안전 제약 안에서 공간 활용률을 우선합니다.": [
    "Prioritizes space utilization within safety constraints using same-SKU blocks, maximal empty spaces and Beam Search.",
    "Ưu tiên tận dụng không gian trong ràng buộc an toàn bằng khối cùng SKU, khoảng trống tối đa và Beam Search."
  ],
  "안정성 우선형": [
    "Stability first",
    "Ưu tiên ổn định"
  ],
  "같은 블록 탐색을 사용하면서 낮은 무게중심, 좌우·전후 중량 균형과 넓은 접촉을 더 강하게 평가합니다.": [
    "Uses the same block search with greater emphasis on low center of gravity, lateral/longitudinal weight balance and broad contact.",
    "Dùng cùng tìm kiếm khối, chú trọng hơn trọng tâm thấp, cân bằng trọng lượng ngang/dọc và tiếp xúc rộng."
  ],
  "하역 편의형": [
    "Unloading convenience",
    "Thuận tiện dỡ hàng"
  ],
  "블록·최대 빈 공간 탐색에 하역 순서를 추가 점수로 반영하되 지지·압축하중·중량 안전조건은 그대로 유지합니다.": [
    "Adds unloading-order scoring to block and maximal-empty-space search while retaining support, compression and weight safety constraints.",
    "Thêm điểm thứ tự dỡ hàng vào tìm kiếm khối và khoảng trống tối đa, giữ nguyên ràng buộc an toàn về đỡ, tải nén và trọng lượng."
  ],
  "추가 적재 가능한 공간을 모두 사용했습니다.": [
    "All available space for additional loading has been used.",
    "Đã dùng hết chỗ trống có thể xếp thêm."
  ],
  "컨테이너 최대 적재중량에 도달했습니다.": [
    "Container payload limit reached.",
    "Đã đạt giới hạn tải trọng container."
  ],
  "충돌·지지·적층·상부하중 조건을 만족하는 추가 위치가 없습니다.": [
    "No additional position meets collision, support, stacking and top-load conditions.",
    "Không có vị trí thêm đáp ứng điều kiện va chạm, đỡ, xếp chồng và tải phía trên."
  ],
  "탐색 상한 {0}개까지 추가 적재 가능합니다.": [
    "Up to the search limit of {0} additional items can be loaded.",
    "Có thể xếp thêm đến giới hạn tìm kiếm {0} mục."
  ],
  "컨테이너 최대 적재중량 기준 추가 한도에 도달했습니다.": [
    "Additional capacity is limited by the container payload limit.",
    "Đã đạt sức chứa thêm theo giới hạn tải trọng container."
  ],
  "남은 체적 기준 추가 한도까지 탐색했습니다.": [
    "Searched up to the additional capacity allowed by remaining volume.",
    "Đã tìm đến sức chứa thêm theo thể tích còn lại."
  ],
  "남은 화물 중 현재 컨테이너 규격과 제약조건으로 1개도 적재할 수 없는 품목이 있습니다.": [
    "Some remaining items cannot fit even one unit under the current container dimensions and constraints.",
    "Có mặt hàng còn lại không xếp được dù một đơn vị theo kích thước và ràng buộc container hiện tại."
  ],
  "최대 {0}대 계산 제한에 도달했습니다.": [
    "Reached the calculation limit of {0} containers.",
    "Đã đạt giới hạn tính toán {0} container."
  ],
  "드래그 근처": [
    "Near dragged position",
    "Gần vị trí kéo"
  ],
  "안쪽 벽 정렬": [
    "Align with inner wall",
    "Căn theo vách trong"
  ],
  "문쪽 벽 정렬": [
    "Align with door wall",
    "Căn theo vách cửa"
  ],
  "좌측 벽 정렬": [
    "Align with left wall",
    "Căn theo vách trái"
  ],
  "우측 벽 정렬": [
    "Align with right wall",
    "Căn theo vách phải"
  ],
  "바닥 정렬": [
    "Align with floor",
    "Căn theo sàn"
  ],
  "주변 빈 공간": [
    "Nearby free space",
    "Chỗ trống gần đó"
  ],
  "안쪽 벽": [
    "Inner wall",
    "Vách trong"
  ],
  "문쪽 벽": [
    "Door wall",
    "Vách cửa"
  ],
  "좌측 벽": [
    "Left wall",
    "Vách trái"
  ],
  "우측 벽": [
    "Right wall",
    "Vách phải"
  ],
  "같은 품목 옆": [
    "Beside the same item",
    "Cạnh cùng mặt hàng"
  ],
  "기존 박스 옆": [
    "Beside an existing box",
    "Cạnh thùng hiện có"
  ],
  "상단 지지면": [
    "Upper support surface",
    "Bề mặt đỡ phía trên"
  ],
  "자동 제한 · 박스 강도 미확인": [
    "Automatic limit · Box strength unverified",
    "Giới hạn tự động · Chưa xác minh độ bền thùng"
  ],
  "사용자가 명시한 상부 적재 금지": [
    "User-specified no-stacking-above rule",
    "Người dùng chỉ định cấm xếp phía trên"
  ],
  "사용자가 입력한 상부 허용하중": [
    "User-entered permitted top load",
    "Tải cho phép phía trên do người dùng nhập"
  ],
  "자동 제한 · 신규 박스 강도 미확인": [
    "Automatic limit · New box strength unverified",
    "Giới hạn tự động · Chưa xác minh độ bền thùng mới"
  ],
  "자동 제한 · 직접 적재 제품의 적층 정보 없음": [
    "Automatic limit · No stacking data for direct-loaded product",
    "Giới hạn tự động · Không có dữ liệu xếp chồng sản phẩm xếp trực tiếp"
  ],
  "박스 등록값·포장 계산에서 적용": [
    "Applied from box registration and packaging calculation",
    "Áp dụng từ dữ liệu đăng ký thùng và tính đóng gói"
  ],
  "저장된 화물 제한 · 설정 출처 미기록": [
    "Saved cargo limit · Setting source not recorded",
    "Giới hạn hàng đã lưu · Không ghi nguồn cài đặt"
  ],
  "최대 1단": [
    "Maximum 1 layer",
    "Tối đa 1 tầng"
  ],
  "상부 허용하중 0 kg": [
    "Permitted top load 0 kg",
    "Tải cho phép phía trên 0 kg"
  ],
  "균등분산": [
    "Even distribution",
    "Phân bố đều"
  ],
  "기본배치": [
    "Default layout",
    "Bố trí mặc định"
  ],
  "앱 기본값이며 현장 자재로 확인 필요. 실제 자재 강도·정격을 보증하지 않음.": [
    "App defaults require verification with on-site materials. Actual material strength and ratings are not guaranteed.",
    "Giá trị mặc định của ứng dụng cần kiểm tra với vật liệu hiện trường. Không bảo đảm độ bền hay định mức vật liệu thực tế."
  ],
  "측면 틈": [
    "Side gap",
    "Khe bên"
  ],
  "문쪽 끝단": [
    "Door-end face",
    "Mặt cuối phía cửa"
  ],
  "높이 단차": [
    "Height step",
    "Chênh cao"
  ],
  "행 내부 틈": [
    "Gap within row",
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
    "Material not confirmed",
    "Chưa xác nhận vật liệu"
  ],
  "실제 적재 순서": [
    "Actual loading order",
    "Thứ tự xếp hàng thực tế"
  ],
  "실제 하역 순서": [
    "Actual unloading order",
    "Thứ tự dỡ hàng thực tế"
  ],
  "{0}번 · {1} {2} · R{3} C{4} L{5} · {6} · X {7} / Y {8} / Z {9}m": [
    "Step {0} · {2} {1} · R{3} C{4} L{5} · {6} · X {7} / Y {8} / Z {9}m",
    "Bước {0} · {2} {1} · R{3} C{4} L{5} · {6} · X {7} / Y {8} / Z {9}m"
  ],
  "자동 방향": [
    "Automatic orientation",
    "Hướng tự động"
  ],
  "정방향 고정": [
    "Fixed normal orientation",
    "Cố định hướng bình thường"
  ],
  "90도 회전 고정": [
    "Fixed 90° rotation",
    "Cố định xoay 90°"
  ],
  "SKU 교차 방향": [
    "Alternating SKU orientation",
    "Hướng SKU xen kẽ"
  ],
  "{0} · 높이 {1}% · {2}단 제한": [
    "{0} · Height {1}% · Limit {2} levels",
    "{0} · Cao {1}% · Giới hạn {2} tầng"
  ],
  "팔레트 위 재배치 · {0}": [
    "Rearrange on pallets · {0}",
    "Bố trí lại trên pallet · {0}"
  ],
  "안쪽 밀착 2열 · {0}": [
    "2 columns flush with inner end · {0}",
    "2 cột sát phía trong · {0}"
  ],
  "문쪽 밀착 2열 · {0}": [
    "2 columns flush with door end · {0}",
    "2 cột sát phía cửa · {0}"
  ],
  "현재 팔레트 적재안": [
    "Current pallet plan",
    "Phương án pallet hiện tại"
  ],
  "보조 고정 없음": [
    "No additional securing",
    "Không có cố định bổ sung"
  ],
  "1차 보강 · 기본 고정": [
    "Level 1 reinforcement · Basic securing",
    "Gia cố cấp 1 · Cố định cơ bản"
  ],
  "2차 보강 · 강화 고정": [
    "Level 2 reinforcement · Enhanced securing",
    "Gia cố cấp 2 · Cố định tăng cường"
  ],
  "3차 보강 · 최대 결속": [
    "Level 3 reinforcement · Maximum restraint",
    "Gia cố cấp 3 · Ràng buộc tối đa"
  ],
  "기본 운송 고정 · 밴딩+각대+랩핑": [
    "Basic transport securing · Straps+corner guards+wrap",
    "Cố định vận chuyển cơ bản · Đai+nẹp góc+màng quấn"
  ],
  "2차 보강 · 강화 밴딩+각대+랩핑": [
    "Level 2 reinforcement · Enhanced straps+corner guards+wrap",
    "Gia cố cấp 2 · Đai tăng cường+nẹp góc+màng quấn"
  ],
  "3차 보강 · 고정바 포함 최대 결속": [
    "Level 3 reinforcement · Maximum restraint with load bars",
    "Gia cố cấp 3 · Ràng buộc tối đa gồm thanh chặn"
  ],
  "기본 운송 고정 · 미끄럼방지+블로킹": [
    "Basic transport securing · Anti-slip+blocking",
    "Cố định vận chuyển cơ bản · Chống trượt+chèn chặn"
  ],
  "2차 보강 · 블로킹+고정바": [
    "Level 2 reinforcement · Blocking+load bars",
    "Gia cố cấp 2 · Chèn chặn+thanh chặn"
  ],
  "3차 보강 · 최대 블로킹": [
    "Level 3 reinforcement · Maximum blocking",
    "Gia cố cấp 3 · Chèn chặn tối đa"
  ],
  "중량 제한": [
    "Weight limit",
    "Giới hạn trọng lượng"
  ],
  "경계 / 충돌": [
    "Bounds / collision",
    "Biên / va chạm"
  ],
  "{0}건 검증 이슈": [
    "{0} validation issues",
    "{0} vấn đề kiểm tra"
  ],
  "컨테이너 경계·충돌 이상 없음": [
    "No container-boundary or collision issues",
    "Không có lỗi biên container hoặc va chạm"
  ],
  "최고 {0} / {1} m": [
    "Maximum height {0} / {1} m",
    "Chiều cao tối đa {0} / {1} m"
  ],
  "{0}개 위치 초과 가능성": [
    "{0} positions may exceed limits",
    "{0} vị trí có thể vượt giới hạn"
  ],
  "품목별 최대 적층단 이내": [
    "Within each item's stacking-level limit",
    "Trong giới hạn số tầng của từng mặt hàng"
  ],
  "상부 허용중량": [
    "Permitted top load",
    "Tải cho phép phía trên"
  ],
  "{0}개 박스 보수적 재확인 필요": [
    "{0} boxes need a conservative recheck",
    "{0} thùng cần kiểm tra lại thận trọng"
  ],
  "보수적 상부하중 검사 통과": [
    "Conservative top-load check passed",
    "Đạt kiểm tra tải phía trên thận trọng"
  ],
  "바닥 하중 분포": [
    "Floor-load distribution",
    "Phân bố tải sàn"
  ],
  "최대 {0} kg/m² · 평균 {1} kg/m² · 경고기준 {2} kg/m² / 평균×{3}": [
    "Maximum {0} kg/m² · Average {1} kg/m² · Warning {2} kg/m² / average×{3}",
    "Tối đa {0} kg/m² · Trung bình {1} kg/m² · Cảnh báo {2} kg/m² / trung bình×{3}"
  ],
  "문쪽 8% 구간에 천장 높이의 92%를 넘는 화물이 있어 개방 전 재확인 필요": [
    "Cargo in the door-side 8% zone exceeds 92% of ceiling height. Recheck before opening.",
    "Hàng trong vùng 8% phía cửa vượt 92% chiều cao trần. Kiểm tra lại trước khi mở."
  ],
  "문 개방 시 상단 낙하 위험 기준 통과": [
    "Passed the upper-cargo fall-risk check for door opening",
    "Đạt kiểm tra nguy cơ hàng phía trên rơi khi mở cửa"
  ],
  "길이 활용 {0}% · 문쪽 공백 {1} mm": [
    "Length utilization {0}% · Door-end gap {1} mm",
    "Sử dụng chiều dài {0}% · Khoảng trống phía cửa {1} mm"
  ],
  "선택한 박스를 찾을 수 없습니다.": [
    "Selected box not found.",
    "Không tìm thấy thùng đã chọn."
  ],
  "품목 정보가 없습니다: {0}": [
    "Item information missing: {0}",
    "Thiếu thông tin mặt hàng: {0}"
  ],
  "이 박스는 위 화물을 지지하고 있어 먼저 이동할 수 없습니다.": [
    "This box supports cargo above and cannot be moved first.",
    "Thùng này đỡ hàng phía trên nên không thể di chuyển trước."
  ],
  "컨테이너 벽·바닥·천장 경계를 벗어납니다.": [
    "Outside the container walls, floor or ceiling.",
    "Vượt biên vách, sàn hoặc trần container."
  ],
  "다른 화물과 충돌합니다.": [
    "Collides with other cargo.",
    "Va chạm với hàng khác."
  ],
  "바닥 또는 하부 박스가 전체 바닥면을 지지하지 못합니다.": [
    "The floor or lower boxes do not support the entire base.",
    "Sàn hoặc thùng dưới không đỡ toàn bộ đáy."
  ],
  "최대 적층단 또는 상부 허용중량 조건을 만족하지 않습니다.": [
    "Maximum stacking level or permitted top-load conditions are not met.",
    "Không đáp ứng số tầng tối đa hoặc tải cho phép phía trên."
  ],
  "이동할 박스가 선택되지 않았습니다.": [
    "No boxes selected to move.",
    "Chưa chọn thùng để di chuyển."
  ],
  "선택 블록이 선택되지 않은 상부 화물을 지지하고 있습니다.": [
    "The selected block supports unselected cargo above.",
    "Khối đã chọn đang đỡ hàng phía trên chưa được chọn."
  ],
  "{0}: 컨테이너 경계를 벗어납니다.": [
    "{0}: outside the container boundary.",
    "{0}: vượt biên container."
  ],
  "{0}: 이동 후 다른 화물과 충돌합니다.": [
    "{0}: collides with other cargo after moving.",
    "{0}: va chạm với hàng khác sau khi di chuyển."
  ],
  "{0}: 이동 후 바닥면 전체가 지지되지 않습니다.": [
    "{0}: the entire base is not supported after moving.",
    "{0}: toàn bộ đáy không được đỡ sau khi di chuyển."
  ],
  "{0}: 적층단 또는 상부 허용중량 조건을 만족하지 않습니다.": [
    "{0}: stacking-level or permitted top-load conditions are not met.",
    "{0}: không đáp ứng số tầng hoặc tải cho phép phía trên."
  ],
  "새 운영 오류가 발생합니다: {0} · {1}": [
    "A new operational error would occur: {0} · {1}",
    "Sẽ phát sinh lỗi vận hành mới: {0} · {1}"
  ],
  "기존 운영 오류가 악화됩니다: {0} · {1}": [
    "An existing operational error would worsen: {0} · {1}",
    "Lỗi vận hành hiện có sẽ nghiêm trọng hơn: {0} · {1}"
  ],
  "기존 운영 오류의 영향 범위가 커집니다: {0} · {1}": [
    "An existing operational error would affect more cargo: {0} · {1}",
    "Lỗi vận hành hiện có sẽ ảnh hưởng thêm hàng: {0} · {1}"
  ],
  "새 안전 차단 오류가 발생합니다: {0}": [
    "A new blocking safety error would occur: {0}",
    "Sẽ phát sinh lỗi an toàn chặn mới: {0}"
  ],
  "기존 총중량 초과가 악화됩니다: {0}": [
    "The existing total-weight overload would worsen: {0}",
    "Tình trạng vượt tổng trọng lượng hiện có sẽ nghiêm trọng hơn: {0}"
  ],
  "기존 안전 오류의 영향 범위가 커집니다: {0}": [
    "An existing safety error would affect more cargo: {0}",
    "Lỗi an toàn hiện có sẽ ảnh hưởng thêm hàng: {0}"
  ],
  "{0} 외 {1}건": [
    "{0} and {1} more",
    "{0} và {1} mục khác"
  ],
  "허용 회전 입력 오류": [
    "Invalid permitted orientation input",
    "Dữ liệu hướng xoay cho phép không hợp lệ"
  ],
  "화물 무게중심 입력 오류": [
    "Invalid cargo center-of-gravity input",
    "Dữ liệu trọng tâm hàng không hợp lệ"
  ],
  "마찰계수 입력 오류": [
    "Invalid friction coefficient input",
    "Dữ liệu hệ số ma sát không hợp lệ"
  ],
  "허용 면압 입력 오류": [
    "Invalid permitted contact-pressure input",
    "Dữ liệu áp lực tiếp xúc cho phép không hợp lệ"
  ],
  "SKU 코드가 비어 있어 적재 대상에서 제외됨": [
    "Excluded because the SKU code is empty",
    "Loại khỏi xếp hàng vì mã SKU trống"
  ],
  "박스 길이·폭·높이는 0보다 큰 유한한 값이어야 함": [
    "Box length, width and height must be finite and greater than zero",
    "Chiều dài, rộng và cao thùng phải hữu hạn và lớn hơn 0"
  ],
  "박스 중량은 0보다 큰 유한한 값이어야 함": [
    "Box weight must be finite and greater than zero",
    "Trọng lượng thùng phải hữu hạn và lớn hơn 0"
  ],
  "수량은 0 이상의 정수여야 함": [
    "Quantity must be a nonnegative integer",
    "Số lượng phải là số nguyên không âm"
  ],
  "최대 적층단은 1 이상의 정수여야 함": [
    "Maximum stacking levels must be an integer of at least 1",
    "Số tầng tối đa phải là số nguyên từ 1 trở lên"
  ],
  "상부 허용중량은 0 이상의 유한한 값이어야 함": [
    "Permitted top load must be finite and nonnegative",
    "Tải cho phép phía trên phải hữu hạn và không âm"
  ],
  "하역 우선순위는 1 이상의 정수여야 함": [
    "Unloading priority must be an integer of at least 1",
    "Ưu tiên dỡ hàng phải là số nguyên từ 1 trở lên"
  ],
  "동일 SKU 코드에 서로 다른 규격·중량·적층조건이 입력되어 전체 행을 제외함": [
    "All rows excluded because the same SKU has conflicting dimensions, weight or stacking conditions",
    "Loại toàn bộ dòng vì cùng SKU có kích thước, trọng lượng hoặc điều kiện xếp chồng khác nhau"
  ],
  "문 개구 입력 오류": [
    "Invalid door-opening input",
    "Dữ liệu cửa mở không hợp lệ"
  ],
  "차량 자중 입력 오류": [
    "Invalid vehicle tare input",
    "Dữ liệu tự trọng xe không hợp lệ"
  ],
  "바닥 선하중 입력 오류": [
    "Invalid floor line-load input",
    "Dữ liệu tải tuyến tính sàn không hợp lệ"
  ],
  "실제 축 제원 입력 오류": [
    "Invalid actual axle specifications",
    "Thông số trục thực tế không hợp lệ"
  ],
  "적재 접근면 입력 오류": [
    "Invalid loading-access face input",
    "Dữ liệu mặt tiếp cận xếp hàng không hợp lệ"
  ],
  "컨테이너 길이·폭·높이는 0보다 큰 유한한 값이어야 함": [
    "Container length, width and height must be finite and greater than zero",
    "Chiều dài, rộng và cao container phải hữu hạn và lớn hơn 0"
  ],
  "컨테이너 최대 적재중량은 0보다 큰 유한한 값이어야 함": [
    "Container payload limit must be finite and greater than zero",
    "Giới hạn tải trọng container phải hữu hạn và lớn hơn 0"
  ],
  "바닥 허용하중은 0보다 큰 유한한 값이어야 함": [
    "Floor-load limit must be finite and greater than zero",
    "Giới hạn tải sàn phải hữu hạn và lớn hơn 0"
  ],
  "바닥하중 경고 배수는 0보다 큰 유한한 값이어야 함": [
    "Floor-load warning multiplier must be finite and greater than zero",
    "Hệ số cảnh báo tải sàn phải hữu hạn và lớn hơn 0"
  ],
  "{0}: 허용 회전 입력 오류": [
    "{0}: Invalid permitted orientation input",
    "{0}: Dữ liệu hướng xoay cho phép không hợp lệ"
  ],
  "{0}: 화물 무게중심 입력 오류": [
    "{0}: Invalid cargo center-of-gravity input",
    "{0}: Dữ liệu trọng tâm hàng không hợp lệ"
  ],
  "{0}: 마찰계수 입력 오류": [
    "{0}: Invalid friction coefficient input",
    "{0}: Dữ liệu hệ số ma sát không hợp lệ"
  ],
  "{0}: 허용 면압 입력 오류": [
    "{0}: Invalid permitted contact-pressure input",
    "{0}: Dữ liệu áp lực tiếp xúc cho phép không hợp lệ"
  ],
  "{0}: SKU 코드가 비어 있어 적재 대상에서 제외됨": [
    "{0}: Excluded because the SKU code is empty",
    "{0}: Loại khỏi xếp hàng vì mã SKU trống"
  ],
  "{0}: 박스 길이·폭·높이는 0보다 큰 유한한 값이어야 함": [
    "{0}: Box length, width and height must be finite and greater than zero",
    "{0}: Chiều dài, rộng và cao thùng phải hữu hạn và lớn hơn 0"
  ],
  "{0}: 박스 중량은 0보다 큰 유한한 값이어야 함": [
    "{0}: Box weight must be finite and greater than zero",
    "{0}: Trọng lượng thùng phải hữu hạn và lớn hơn 0"
  ],
  "{0}: 수량은 0 이상의 정수여야 함": [
    "{0}: Quantity must be a nonnegative integer",
    "{0}: Số lượng phải là số nguyên không âm"
  ],
  "{0}: 최대 적층단은 1 이상의 정수여야 함": [
    "{0}: Maximum stacking levels must be an integer of at least 1",
    "{0}: Số tầng tối đa phải là số nguyên từ 1 trở lên"
  ],
  "{0}: 상부 허용중량은 0 이상의 유한한 값이어야 함": [
    "{0}: Permitted top load must be finite and nonnegative",
    "{0}: Tải cho phép phía trên phải hữu hạn và không âm"
  ],
  "{0}: 하역 우선순위는 1 이상의 정수여야 함": [
    "{0}: Unloading priority must be an integer of at least 1",
    "{0}: Ưu tiên dỡ hàng phải là số nguyên từ 1 trở lên"
  ],
  "{0}: 동일 SKU 코드에 서로 다른 규격·중량·적층조건이 입력되어 전체 행을 제외함": [
    "{0}: All rows excluded because the same SKU has conflicting dimensions, weight or stacking conditions",
    "{0}: Loại toàn bộ dòng vì cùng SKU có kích thước, trọng lượng hoặc điều kiện xếp chồng khác nhau"
  ],
  "적재된 화물이 없어 품질 평가를 계산할 수 없습니다.": [
    "No cargo is loaded, so loading quality cannot be assessed.",
    "Chưa xếp hàng nên không thể đánh giá chất lượng xếp hàng."
  ],
  "좌우 무게중심이 중앙에 가깝습니다.": [
    "The lateral center of gravity is near the center.",
    "Trọng tâm ngang gần vị trí giữa."
  ],
  "좌우 무게중심 편차가 {0}%입니다.": [
    "Lateral center-of-gravity deviation is {0}%.",
    "Độ lệch trọng tâm ngang là {0}%."
  ],
  "앞뒤 무게분포가 비교적 균형적입니다.": [
    "Longitudinal weight distribution is relatively balanced.",
    "Phân bố trọng lượng dọc tương đối cân bằng."
  ],
  "앞뒤 무게중심 편차가 {0}%입니다.": [
    "Longitudinal center-of-gravity deviation is {0}%.",
    "Độ lệch trọng tâm dọc là {0}%."
  ],
  "무게중심 높이가 낮아 안정적인 편입니다.": [
    "The low center of gravity contributes to stability.",
    "Trọng tâm thấp góp phần tăng độ ổn định."
  ],
  "무게중심 높이가 컨테이너 높이의 {0}%로 높습니다.": [
    "The center of gravity is high at {0}% of container height.",
    "Trọng tâm cao ở mức {0}% chiều cao container."
  ],
  "컨테이너 길이 절반 어느 쪽도 총중량의 60%를 넘지 않아 종방향 분포가 양호합니다.": [
    "Neither longitudinal half exceeds 60% of total weight, indicating good longitudinal distribution.",
    "Không nửa nào theo chiều dài vượt 60% tổng trọng lượng, cho thấy phân bố dọc tốt."
  ],
  "컨테이너 길이 절반 한쪽에 총중량의 {0}%가 몰려 있습니다.": [
    "{0}% of total weight is concentrated in one longitudinal half of the container.",
    "{0}% tổng trọng lượng tập trung ở một nửa theo chiều dài container."
  ],
  "같은 품목이 여러 구역으로 분산된 종류가 {0}개입니다. 안전성은 물리 검증에서 별도 판정합니다.": [
    "{0} item types are spread across multiple zones. Safety is determined separately through physics validation.",
    "Có {0} loại mặt hàng phân tán ở nhiều vùng. An toàn được đánh giá riêng bằng kiểm tra vật lý."
  ],
  "동일 품목 묶음 상태가 양호합니다. 실제 안정성은 Rapier 물리 검증 결과를 사용합니다.": [
    "Same-item grouping is good. Use Rapier physics validation results for actual stability.",
    "Các mặt hàng cùng loại được nhóm tốt. Dùng kết quả kiểm tra vật lý Rapier để xác định độ ổn định thực tế."
  ]
};
