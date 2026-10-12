/** Viewer and administrator display copy only. */
export const uiMessagesViewer: Record<string, readonly [string, string]> = {
  "팔레트 상세 보기": ["View pallet details", "Xem chi tiết pallet"],
  "후면": ["Rear", "Phía sau"],
  "길이": ["Length", "Chiều dài"],
  "폭": ["Width", "Chiều rộng"],
  "안쪽 경계": ["Inner boundary", "Ranh giới phía trong"],
  "문쪽 경계": ["Door boundary", "Ranh giới phía cửa"],
  "후면 경계": ["Rear boundary", "Ranh giới phía sau"],
  "왼쪽 경계": ["Left boundary", "Ranh giới bên trái"],
  "오른쪽 경계": ["Right boundary", "Ranh giới bên phải"],
  "상부 경계": ["Upper boundary", "Giới hạn phía trên"],
  "후면 기준": ["Rear reference", "Mốc phía sau"],
  "경계 초과": ["Beyond boundary", "Vượt ranh giới"],
  "선택 적재물 경계 거리": ["Selected cargo boundary distances", "Khoảng cách từ hàng đã chọn đến ranh giới"],
  "선택 해제": ["Clear selection", "Bỏ chọn"],
  "팔레트 받침": ["Pallet base", "Đế pallet"],
  "적재 공간 경계까지 거리": ["Distance to loading-space boundaries", "Khoảng cách đến ranh giới khoang hàng"],
  "치수선 표시 방향": ["Dimension-line direction", "Hướng hiển thị đường kích thước"],
  "좌우는 후면에서 안쪽을 보는 기준입니다.": ["Left/right are viewed from the rear looking inward.", "Trái/phải tính khi nhìn từ phía sau vào trong."],
  "선택물 외곽부터 공간 경계까지의 직선 거리입니다. 사이에 다른 화물·지지대가 있을 수 있으며, 통로 폭이나 안전 판정이 아닙니다.": ["Straight-line distances from the selected object’s outer bounds to the loading-space boundaries. Other cargo or supports may lie between them. These are not aisle widths or safety verdicts.", "Khoảng cách thẳng từ biên ngoài vật đã chọn đến ranh giới khoang hàng. Ở giữa có thể có hàng hoặc vật đỡ khác. Đây không phải chiều rộng lối đi hay kết luận an toàn."],
  "팔레트 받침 자체 기준 · 위에 실린 상자는 별도 선택": ["Pallet base only · Select loaded cartons separately", "Chỉ tính đế pallet · Chọn riêng thùng hàng bên trên"],

  "장비 이미지 수정 등 관리자 전용 기능을 사용하려면 로그인하세요.": [
    "Sign in to use administrator-only features such as equipment image editing.",
    "Đăng nhập để dùng chức năng dành cho quản trị viên như sửa ảnh phương tiện."
  ],
  "관리자 세션은 현재 브라우저 탭을 닫으면 자동 해제됩니다.": [
    "The administrator session ends automatically when this browser tab closes.",
    "Phiên quản trị viên tự kết thúc khi đóng thẻ trình duyệt này."
  ],
  "3D 적재 공간 도구": [
    "3D loading-space tools",
    "Công cụ khoang xếp hàng 3D"
  ],
  "3D 적재 공간": [
    "3D loading space",
    "Khoang xếp hàng 3D"
  ],
  "전체": [
    "All",
    "Tất cả"
  ],
  "{0} m 아래": [
    "Below {0} m",
    "Dưới {0} m"
  ],
  "표시": [
    "Shown",
    "Đang hiển thị"
  ],
  "특수화물 전용 장비 · 박스 적재 결과는 참고용": [
    "Specialized cargo equipment · Carton loading results are for reference only",
    "Phương tiện hàng chuyên dụng · Kết quả xếp thùng chỉ để tham khảo"
  ],
  "공간 사용": [
    "Space used",
    "Không gian đã dùng"
  ],
  "잔여 체적": [
    "Remaining volume",
    "Thể tích còn lại"
  ],
  "WHAT-IF REVIEW · 출고 승인 불가 · 원 기준 위반 {0}건": [
    "WHAT-IF REVIEW · Not approved for shipment · {0} original-rule violations",
    "XEM XÉT WHAT-IF · Không được phê duyệt xuất hàng · {0} vi phạm quy tắc gốc"
  ],
  "규칙 위반 {0}건": [
    "{0} rule violations",
    "{0} vi phạm quy tắc"
  ],
  "적재 규칙 검사 통과": [
    "Loading-rule checks passed",
    "Kiểm tra quy tắc xếp hàng đạt"
  ],
  "화물을 등록하고 자동 적재를 실행하세요": [
    "Register cargo and run automatic loading",
    "Đăng ký hàng và chạy xếp tự động"
  ],
  "규칙 위반 상세": [
    "Rule violation details",
    "Chi tiết vi phạm quy tắc"
  ],
  "문": [
    "Door",
    "Cửa"
  ],
  "상단 평면 미니맵": [
    "Top-view minimap",
    "Bản đồ nhỏ nhìn từ trên"
  ],
  "컨테이너 상단 평면 적재 미니맵": [
    "Container top-view loading minimap",
    "Bản đồ nhỏ xếp container nhìn từ trên"
  ],
  "빈 공간": [
    "Empty space",
    "Không gian trống"
  ],
  "전체 {0}단": [
    "All {0} layers",
    "Tất cả {0} tầng"
  ],
  "1단만": [
    "Layer 1 only",
    "Chỉ tầng 1"
  ],
  "1~{0}단": [
    "Layers 1–{0}",
    "Tầng 1–{0}"
  ],
  "1단": [
    "Layer 1",
    "Tầng 1"
  ],
  "1~3단": [
    "Layers 1–3",
    "Tầng 1–3"
  ],
  "1~5단": [
    "Layers 1–5",
    "Tầng 1–5"
  ],
  "기존 로컬 이미지 {0}개를 Supabase로 이전했습니다.": [
    "Moved {0} existing local images to Supabase.",
    "Đã chuyển {0} ảnh cục bộ hiện có sang Supabase."
  ],
  "기존 이미지를 서버로 이전하지 못했습니다.": [
    "Could not move existing images to the server.",
    "Không chuyển được ảnh hiện có lên máy chủ."
  ],
  "{0} 적재공간 이미지": [
    "{0} loading-space image",
    "Ảnh khoang xếp hàng {0}"
  ],
  "{0} 이미지를 Supabase에 저장했습니다. 유형 선택창과 적재공간 화면에 함께 적용됩니다.": [
    "Saved the {0} image to Supabase. It is used in equipment selection and loading-space views.",
    "Đã lưu ảnh {0} vào Supabase. Ảnh được dùng ở màn hình chọn phương tiện và khoang hàng."
  ],
  "이미지를 변경하지 못했습니다.": [
    "Could not change the image.",
    "Không đổi được ảnh."
  ],
  "현재 기본 그림을 사용 중입니다.": [
    "The default image is already in use.",
    "Đang dùng ảnh mặc định."
  ],
  "{0} 서버 이미지를 삭제하고 기본 그림으로 복원했습니다.": [
    "Deleted the {0} server image and restored the default.",
    "Đã xóa ảnh {0} trên máy chủ và khôi phục ảnh mặc định."
  ],
  "기본 그림으로 복원하지 못했습니다.": [
    "Could not restore the default image.",
    "Không khôi phục được ảnh mặc định."
  ],
  "관리자 적재공간 이미지 관리": [
    "Administrator loading-space image management",
    "Quản lý ảnh khoang hàng của quản trị viên"
  ],
  "관리자 이미지 관리 · Supabase 서버 저장": [
    "Administrator image management · Saved on Supabase",
    "Quản lý ảnh quản trị viên · Lưu trên Supabase"
  ],
  "이미지 변경": [
    "Change image",
    "Đổi ảnh"
  ],
  "기본 그림 복원": [
    "Restore default image",
    "Khôi phục ảnh mặc định"
  ],
  "Three.js 화면 준비 중": [
    "Preparing Three.js view",
    "Đang chuẩn bị màn hình Three.js"
  ],
  "포장 완료 바닥 미리보기": [
    "Packaged-carton floor preview",
    "Xem trước thùng đã đóng trên sàn"
  ],
  "최종 적재 전, 선택한 포장 박스를 적재공간 바닥에 1단으로 펼쳐 확인합니다.": [
    "Before final loading, inspect the selected cartons spread in one layer on the loading-space floor.",
    "Trước khi xếp cuối cùng, kiểm tra thùng đã chọn được trải một tầng trên sàn khoang hàng."
  ],
  "BOX·EA 표시": [
    "BOX/EA shown",
    "BOX/EA hiển thị"
  ],
  "포장 완료 바닥 배치": [
    "Packaged-carton floor layout",
    "Bố trí thùng đã đóng trên sàn"
  ],
  "바닥에 한 번에 펼칠 수 있는 수량을 초과했습니다. 화면에는": [
    "The quantity exceeds the floor preview capacity. Showing",
    "Số lượng vượt khả năng xem trước trên sàn. Hiển thị"
  ],
  "개만 표시하며 실제 자동 적재 단계에서는 전체": [
    "units only; actual auto-loading will calculate all",
    "đơn vị; xếp tự động thực tế sẽ tính toàn bộ"
  ],
  "개를 계산합니다.": [
    "units.",
    "đơn vị."
  ],
  "X · 길이": [
    "X · Length",
    "X · Dài"
  ],
  "Y · 폭": [
    "Y · Width",
    "Y · Rộng"
  ],
  "Z · 높이": [
    "Z · Height",
    "Z · Cao"
  ],
  "문쪽 {0}": [
    "Door side {0}",
    "Phía cửa {0}"
  ],
  "우측 {0}": [
    "Right {0}",
    "Bên phải {0}"
  ],
  "천장 {0}": [
    "Ceiling {0}",
    "Trần {0}"
  ],
  "Meshy 모델을 불러오지 못했습니다": [
    "Could not load the Meshy model",
    "Không tải được mô hình Meshy"
  ],
  "실시간 3D 적재 공간 미리보기": [
    "Live 3D loading-space preview",
    "Xem trước khoang xếp hàng 3D trực tiếp"
  ],
  "실제 내부 규격 미리보기": [
    "Actual internal dimensions",
    "Kích thước trong thực tế"
  ],
  "장비 모델 보기": [
    "Show equipment model",
    "Hiện mô hình phương tiện"
  ],
  "내부 공간 보기": [
    "Show internal space",
    "Hiện khoang bên trong"
  ],
  "3D 미리보기에는 WebGL을 지원하는 브라우저가 필요합니다.": [
    "3D preview requires a browser that supports WebGL.",
    "Xem trước 3D cần trình duyệt hỗ trợ WebGL."
  ],
  "적재 최적화": [
    "Loading optimization",
    "Tối ưu xếp hàng"
  ],
  "은 일반 박스 적재 대상이 아닙니다.": [
    "is not suitable for general carton loading.",
    "không phù hợp để xếp thùng thông thường."
  ],
  "이 장비는 특수화물 전용입니다.": [
    "This equipment is for specialized cargo only.",
    "Phương tiện này chỉ dành cho hàng chuyên dụng."
  ],
  "현재 박스/팔레트 엔진으로 임의 계산하거나 일반화물 작업지시서를 발행하지 않습니다. 장비 변경은 사용자가 직접 선택할 때만 적용됩니다.": [
    "The current carton/pallet engine will not calculate unsupported loads or issue a general-cargo work order. Equipment changes only when you explicitly select it.",
    "Bộ tính thùng/pallet hiện tại không tính tải không được hỗ trợ hoặc phát hành lệnh hàng thông thường. Phương tiện chỉ đổi khi bạn chủ động chọn."
  ],
  "장비 선택": [
    "Select equipment",
    "Chọn phương tiện"
  ],
  "컨테이너 중심 · L/2, W/2": [
    "Container center · L/2, W/2",
    "Tâm container · L/2, W/2"
  ],
  "화물 CG · 컨테이너 중심 대비": [
    "Cargo CG · Relative to container center",
    "Trọng tâm hàng · So với tâm container"
  ],
  "범용 · 추가 박스": [
    "Shared / additional cartons",
    "Thùng dùng chung / bổ sung"
  ],
  "제품 총중량 {0} kg · {1} CBM": [
    "Product gross weight {0} kg · {1} CBM",
    "Tổng khối lượng sản phẩm {0} kg · {1} CBM"
  ],
  "\n자동설계 {0}종은 강도 미검증으로 1단 적용": [
    "\n{0} auto-designed sizes have unverified strength and are limited to 1 layer",
    "\n{0} quy cách tự thiết kế chưa xác minh độ bền, giới hạn 1 tầng"
  ],
  "컨테이너 정보": [
    "Container information",
    "Thông tin container"
  ],
  "제품 포장에서 확정한 박스와 현재 자동 적재 입력이 일치하지 않습니다. 제품 포장 단계에서 포장을 다시 확정한 뒤 자동 적재를 실행하세요.": [
    "The cartons confirmed during product packaging do not match the current auto-loading inputs. Confirm packaging again in the product packaging step before running auto-loading.",
    "Thùng đã xác nhận khi đóng gói không khớp đầu vào xếp tự động hiện tại. Xác nhận lại đóng gói ở bước đóng gói sản phẩm trước khi chạy xếp tự động."
  ],
  " / 나머지 오류도 파일에서 확인하세요.": [
    " / Check the file for the remaining errors.",
    " / Kiểm tra các lỗi còn lại trong tệp."
  ],
  "모바일 버전 준비 중": [
    "Mobile version coming soon",
    "Phiên bản di động đang được chuẩn bị"
  ],
  "현재 물류 적재 시뮬레이터는 PC 웹 버전만 제공됩니다.": [
    "The loading simulator is currently available on desktop web only.",
    "Mô phỏng xếp hàng hiện chỉ có trên web máy tính."
  ],
  "데스크톱 또는 노트북에서 이용해 주세요.": [
    "Please use a desktop or laptop computer.",
    "Vui lòng dùng máy tính để bàn hoặc máy tính xách tay."
  ],
  "기업 작업 공간 · 저장된 계획 보기": [
    "Company workspace · View saved plans",
    "Không gian công ty · Xem kế hoạch đã lưu"
  ],
  "데이터 저장소 연결 실패": [
    "Data store connection failed",
    "Kết nối kho dữ liệu thất bại"
  ],
  "Supabase 데이터 저장소를 준비하지 못해 로컬 저장 방식으로 대체하지 않았습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.": [
    "Could not initialize the Supabase data store. Local storage has not been used as a fallback. Check your internet connection and refresh.",
    "Không khởi tạo được kho dữ liệu Supabase. Hệ thống không dùng lưu trữ cục bộ thay thế. Kiểm tra kết nối internet rồi làm mới."
  ],
  "사용자 수정 규격": [
    "User-edited specifications",
    "Quy cách do người dùng sửa"
  ],
  "등록 박스 적합성을 확인한 뒤 박스 추천을 실행하세요.": [
    "Check registered carton compatibility, then run carton recommendations.",
    "Kiểm tra độ phù hợp của thùng đã đăng ký, rồi chạy đề xuất thùng."
  ],
  "박스 없이 제품 자체 규격으로 직접 적재됩니다.": [
    "Loaded directly using the product dimensions, without a carton.",
    "Xếp trực tiếp theo kích thước sản phẩm, không dùng thùng."
  ],
  "{0} 차량 3D 모형": [
    "3D vehicle model: {0}",
    "Mô hình xe 3D: {0}"
  ],
  "차량 3D 이미지 로드 실패": [
    "Could not load the 3D vehicle image",
    "Không tải được ảnh xe 3D"
  ],
  "차량 3D 이미지 준비 중": [
    "Preparing the 3D vehicle image",
    "Đang chuẩn bị ảnh xe 3D"
  ]
};
