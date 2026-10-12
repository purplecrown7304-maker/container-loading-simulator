/** Product, equipment and auxiliary interface copy. User-entered values are always opaque. */
export const uiMessagesProduct: Record<string, readonly [string, string]> = {
  "제품코드와 제품명을 입력하세요.": [
    "Enter a product code and name.",
    "Nhập mã và tên sản phẩm."
  ],
  "제품 크기와 중량은 0보다 커야 합니다.": [
    "Product dimensions and weight must be greater than 0.",
    "Kích thước và khối lượng sản phẩm phải lớn hơn 0."
  ],
  "이미 등록된 제품코드입니다: {0}": [
    "Product code already registered: {0}",
    "Mã sản phẩm đã đăng ký: {0}"
  ],
  "{0} 제품 정보를 저장했습니다.": [
    "Saved product information for {0}.",
    "Đã lưu thông tin sản phẩm {0}."
  ],
  "{0} {1} 제품을 삭제할까요?": [
    "Delete product {0} {1}?",
    "Xóa sản phẩm {0} {1}?"
  ],
  "{0} 제품을 삭제했습니다.": [
    "Deleted product {0}.",
    "Đã xóa sản phẩm {0}."
  ],
  "{0}행{1}: {2}": [
    "Row {0}{1}: {2}",
    "Dòng {0}{1}: {2}"
  ],
  "반영할 제품이 없습니다. 기존 목록을 유지합니다.{0}": [
    "No products to import. The current list is unchanged.{0}",
    "Không có sản phẩm để nhập. Giữ nguyên danh sách hiện tại.{0}"
  ],
  "제품 엑셀 반영 완료 · 추가 {0}종 · 수정 {1}종 · 확인 필요 {2}건{3}": [
    "Product Excel imported · {0} added · {1} updated · {2} need review{3}",
    "Đã nhập Excel sản phẩm · thêm {0} · cập nhật {1} · cần kiểm tra {2}{3}"
  ],
  "제품 엑셀을 읽지 못했습니다. 기초 양식의 열 이름을 확인하세요.": [
    "Could not read the product Excel file. Check the template column names.",
    "Không đọc được Excel sản phẩm. Kiểm tra tên cột theo mẫu."
  ],
  "박스 포장이 필요한 제품이 없습니다.": [
    "No products require carton packaging.",
    "Không có sản phẩm cần đóng thùng."
  ],
  "현재 보유 박스로 포장 불가": [
    "Cannot pack with the available cartons",
    "Không thể đóng gói bằng thùng hiện có"
  ],
  "현재 보유 박스보다 제품 충진/적재 효율 개선": [
    "Improves product fill/loading efficiency over available cartons",
    "Cải thiện tỷ lệ lấp đầy/xếp hàng so với thùng hiện có"
  ],
  "제품 {0}종과 현재 등록 박스 {1}종을 함께 분석했습니다. 추천 결과는 자동 등록되지 않습니다.": [
    "Analyzed {0} products with {1} registered carton sizes. Recommendations are not registered automatically.",
    "Đã phân tích {0} sản phẩm cùng {1} quy cách thùng đã đăng ký. Đề xuất không được tự động đăng ký."
  ],
  "추천 박스를 등록하려면 먼저 사용자 로그인이 필요합니다. 추천 결과는 자동으로 개인 박스 목록에 추가되지 않습니다.": [
    "Sign in to register a recommended carton. Recommendations are not added to your carton list automatically.",
    "Đăng nhập để đăng ký thùng đề xuất. Đề xuất không tự động được thêm vào danh sách thùng cá nhân."
  ],
  "{0} {1}×{2}×{3} (강도확인)": [
    "{0} {1}×{2}×{3} (verify strength)",
    "{0} {1}×{2}×{3} (kiểm tra độ bền)"
  ],
  "{0} 규격을 사용자가 직접 등록했습니다. 개인 박스 목록에 추가했습니다. 강도는 미입력입니다. 확인 전 실제 적재는 1단·상부하중 0kg로 제한됩니다.": [
    "You registered size {0} in your carton list. Strength is unspecified. Until verified, actual loading is limited to 1 layer and 0 kg top load.",
    "Bạn đã đăng ký quy cách {0} vào danh sách thùng cá nhân. Chưa nhập độ bền. Trước khi xác minh, xếp hàng thực tế giới hạn 1 tầng và tải phía trên 0 kg."
  ],
  "범용 추천 {0}×{1}×{2} (강도확인)": [
    "Common carton {0}×{1}×{2} (verify strength)",
    "Thùng dùng chung {0}×{1}×{2} (kiểm tra độ bền)"
  ],
  "{0} 범용 규격을 사용자가 직접 등록했습니다. 개인 박스 목록에 추가했습니다. 압축강도 확인 후 상부 허용중량을 수정하세요.": [
    "You registered common size {0} in your carton list. Update the permitted top load after verifying compression strength.",
    "Bạn đã đăng ký quy cách dùng chung {0} vào danh sách thùng cá nhân. Cập nhật tải phía trên cho phép sau khi xác minh độ bền nén."
  ],
  "범용 및 추가 박스 추천": [
    "Common and additional carton recommendations",
    "Đề xuất thùng dùng chung và bổ sung"
  ],
  "범용 · 추가 박스 스펙 추천": [
    "Recommended common/additional carton specifications",
    "Đề xuất quy cách thùng dùng chung/bổ sung"
  ],
  "제품 마스터를 관리합니다. 실제 출하 수량은 메인 2단계 제품 선택에서 입력합니다.": [
    "Manage the product master. Enter actual shipment quantities in step 2 of the main workflow.",
    "Quản lý danh mục sản phẩm. Nhập số lượng xuất hàng thực tế ở bước 2 của quy trình chính."
  ],
  "등록 제품 전체와 현재 회사 박스를 함께 분석해 공용화 규격과 추가 보유할 박스 스펙을 제안합니다. 추천만으로 개인 박스 목록에는 추가되지 않습니다.": [
    "Analyze all registered products and company cartons to recommend shared and additional sizes. Recommendations alone do not add cartons to your personal list.",
    "Phân tích toàn bộ sản phẩm và thùng công ty để đề xuất quy cách dùng chung và bổ sung. Đề xuất không tự thêm thùng vào danh sách cá nhân."
  ],
  "기초 엑셀 양식": [
    "Excel template",
    "Mẫu Excel"
  ],
  "등록 제품 엑셀 다운로드": [
    "Download registered products",
    "Tải danh mục sản phẩm đã đăng ký"
  ],
  "제품 엑셀 읽는 중…": [
    "Reading product Excel…",
    "Đang đọc Excel sản phẩm…"
  ],
  "제품 엑셀 업로드": [
    "Upload product Excel",
    "Tải lên Excel sản phẩm"
  ],
  "등록": [
    "Registered",
    "Đã đăng ký"
  ],
  "종 · 보유 박스": [
    "types · Available cartons",
    "types · Thùng hiện có"
  ],
  "종": [
    "types",
    "loại"
  ],
  "등록 제품 전체를 내려받아 수정 후 업로드하세요. 같은 제품코드는 수정, 새 코드는 추가되며 파일에 없는 제품은 유지됩니다.": [
    "Download all products, edit, then upload. Existing product codes are updated, new codes are added, and products missing from the file are retained.",
    "Tải toàn bộ sản phẩm, chỉnh sửa rồi tải lên. Mã hiện có được cập nhật, mã mới được thêm và sản phẩm không có trong tệp được giữ lại."
  ],
  "제품코드": [
    "Product code",
    "Mã sản phẩm"
  ],
  "제품명": [
    "Product name",
    "Tên sản phẩm"
  ],
  "길이 mm": [
    "Length mm",
    "Dài mm"
  ],
  "폭 mm": [
    "Width mm",
    "Rộng mm"
  ],
  "높이 mm": [
    "Height mm",
    "Cao mm"
  ],
  "중량 kg": [
    "Weight kg",
    "Khối lượng kg"
  ],
  "필요": [
    "Required",
    "Cần"
  ],
  "불필요 · 직접 적재": [
    "Not required · Direct loading",
    "Không cần · Xếp trực tiếp"
  ],
  "제품 수정 저장": [
    "Save product changes",
    "Lưu sửa đổi sản phẩm"
  ],
  "제품 등록": [
    "Register product",
    "Đăng ký sản phẩm"
  ],
  "취소": [
    "Cancel",
    "Hủy"
  ],
  "박스 적합성": [
    "Carton compatibility",
    "Độ phù hợp với thùng"
  ],
  "자동 추천 포장": [
    "Recommended packaging",
    "Đóng gói đề xuất"
  ],
  "관리": [
    "Manage",
    "Quản lý"
  ],
  "박스 불필요": [
    "No carton required",
    "Không cần thùng"
  ],
  "보유 박스": [
    "Available carton",
    "Thùng hiện có"
  ],
  "종 적합": [
    "compatible sizes",
    "quy cách phù hợp"
  ],
  "현재 등록 박스에 맞지 않음": [
    "Does not fit registered cartons",
    "Không vừa thùng đã đăng ký"
  ],
  "등록 박스 없음": [
    "No registered cartons",
    "Chưa đăng ký thùng"
  ],
  "신규 규격 추천 사용": [
    "Use a recommended new size",
    "Dùng quy cách mới được đề xuất"
  ],
  "보유 · {0}": [
    "Available · {0}",
    "Hiện có · {0}"
  ],
  "추가 추천 규격": [
    "Additional recommended size",
    "Quy cách bổ sung đề xuất"
  ],
  "제품 실물 적재": [
    "Direct product loading",
    "Xếp sản phẩm trực tiếp"
  ],
  "수정": [
    "Edit",
    "Sửa"
  ],
  "분석 대상": [
    "Analysis scope",
    "Phạm vi phân tích"
  ],
  "회사 제품": [
    "Company products",
    "Sản phẩm công ty"
  ],
  "종 · 현재 회사 박스": [
    "types · Current company cartons",
    "loại · Thùng công ty hiện có"
  ],
  "제품·보유박스 분석": [
    "Analyze products/cartons",
    "Phân tích sản phẩm/thùng"
  ],
  "개별 최적 규격": [
    "Individual optimal sizes",
    "Quy cách tối ưu riêng"
  ],
  "범용화 후": [
    "After standardization",
    "Sau khi dùng chung"
  ],
  "규격 절감": [
    "Size reduction",
    "Giảm quy cách"
  ],
  "평균 효율 손실": [
    "Average efficiency loss",
    "Tổn thất hiệu suất trung bình"
  ],
  "범용 상자 크기 추천": [
    "Recommended shared carton sizes",
    "Quy cách thùng dùng chung đề xuất"
  ],
  "여러 제품에 같이 사용할 수 있는 규격 · 등록 버튼을 눌러야 개인 박스 목록에 추가": [
    "Sizes shared by multiple products · Click Register to add to your personal carton list",
    "Quy cách dùng cho nhiều sản phẩm · Bấm Đăng ký để thêm vào danh sách thùng cá nhân"
  ],
  "현재 보유 박스 재사용": [
    "Reuse an available carton",
    "Tái sử dụng thùng hiện có"
  ],
  "신규 범용 규격": [
    "New shared size",
    "Quy cách dùng chung mới"
  ],
  "개 제품 공용": [
    "products share this size",
    "sản phẩm dùng chung"
  ],
  "보유 중": [
    "Already available",
    "Đã có"
  ],
  "회사 박스로 등록": [
    "Register company carton",
    "Đăng ký thùng công ty"
  ],
  "분석 버튼을 누르면 범용 규격이 표시됩니다.": [
    "Run analysis to display shared sizes.",
    "Chạy phân tích để hiển thị quy cách dùng chung."
  ],
  "추가 보유 권장 박스": [
    "Recommended additional cartons",
    "Thùng bổ sung được đề xuất"
  ],
  "현재 박스 스펙과 비교했을 때 추가하면 효율이 좋아지는 규격 · 등록 전에는 목록에 저장하지 않음": [
    "Sizes that improve efficiency compared with current cartons · Not saved until registered",
    "Quy cách cải thiện hiệu suất so với thùng hiện tại · Chỉ lưu khi đăng ký"
  ],
  "개 제품 개선": [
    "products improved",
    "sản phẩm được cải thiện"
  ],
  "추가추천": [
    "Additional recommendation",
    "Đề xuất bổ sung"
  ],
  "분석 후 현재 보유 박스보다 추가 가치가 있는 규격만 표시합니다.": [
    "After analysis, only sizes that add value over current cartons are displayed.",
    "Sau phân tích, chỉ hiển thị quy cách có lợi hơn thùng hiện có."
  ],
  "제조 규격 · 전략 비교 · 강도 승인": [
    "Manufacturing specifications · Strategy comparison · Strength approval",
    "Quy cách sản xuất · So sánh chiến lược · Phê duyệt độ bền"
  ],
  "제품이 2종 이상이면 여러 SKU에 공용으로 쓸 수 있는 범용 박스 규격을 계산할 수 있습니다.": [
    "With at least 2 products, you can calculate carton sizes shared by multiple SKUs.",
    "Có ít nhất 2 sản phẩm để tính quy cách thùng dùng chung cho nhiều SKU."
  ],
  "제품 또는 회사 박스 조건이 변경되었습니다. 범용 상자 추천을 다시 계산하세요.": [
    "Product or company carton conditions changed. Recalculate shared-carton recommendations.",
    "Điều kiện sản phẩm hoặc thùng công ty đã thay đổi. Tính lại đề xuất thùng dùng chung."
  ],
  "범용 박스 추천은 회사 제품이 2종 이상 등록되어야 계산할 수 있습니다.": [
    "Register at least 2 company products to calculate shared-carton recommendations.",
    "Đăng ký ít nhất 2 sản phẩm công ty để tính đề xuất thùng dùng chung."
  ],
  "범용 박스 {0}종 추천 · 개별 {1}종 → 운영 {2}종": [
    "Recommended {0} shared sizes · {1} individual → {2} operating sizes",
    "Đề xuất {0} quy cách chung · {1} quy cách riêng → {2} quy cách sử dụng"
  ],
  "현재 제품 조합에서는 허용 효율손실 안에서 2개 이상 제품에 공용 가능한 박스를 찾지 못했습니다.": [
    "No carton shared by at least 2 products meets the permitted efficiency loss for this product set.",
    "Không tìm thấy thùng dùng chung cho ít nhất 2 sản phẩm trong mức tổn thất hiệu suất cho phép."
  ],
  "등록된 회사 제품 전체를 비교해 여러 SKU에 공용으로 쓸 수 있는 박스 규격을 추천합니다.": [
    "Compare all registered company products to recommend carton sizes shared by multiple SKUs.",
    "So sánh toàn bộ sản phẩm công ty để đề xuất quy cách thùng dùng chung cho nhiều SKU."
  ],
  "범용 상자 추천 계산": [
    "Calculate shared-carton recommendations",
    "Tính đề xuất thùng dùng chung"
  ],
  "범용화 후 운영 규격": [
    "Operating sizes after standardization",
    "Quy cách sử dụng sau khi dùng chung"
  ],
  "회사 보유 박스": [
    "Company cartons",
    "Thùng công ty"
  ],
  "범용 자동설계": [
    "Automatic shared-carton design",
    "Tự thiết kế thùng dùng chung"
  ],
  "자동설계": [
    "Auto-designed",
    "Tự thiết kế"
  ],
  "기존 규격 재사용": [
    "Reuse existing size",
    "Tái sử dụng quy cách hiện có"
  ],
  "신규 제작 시 압축강도 확인 필요": [
    "Verify compression strength before manufacturing",
    "Xác minh độ bền nén trước khi sản xuất"
  ],
  "현재 조건에서 공용 가능한 안전 규격이 없습니다. 제품별 전용 박스 추천은 계속 사용할 수 있습니다.": [
    "No safe shared size meets current conditions. Product-specific recommendations remain available.",
    "Không có quy cách dùng chung an toàn đáp ứng điều kiện hiện tại. Vẫn có thể dùng đề xuất riêng cho từng sản phẩm."
  ],
  "범용 상자 추천 계산 후 여러 제품에 같이 쓸 수 있는 규격이 여기에 표시됩니다.": [
    "Calculate shared-carton recommendations to show sizes usable for multiple products here.",
    "Tính đề xuất thùng dùng chung để hiển thị quy cách dùng được cho nhiều sản phẩm tại đây."
  ],
  "제품 목록과 보유 박스를 등록한 뒤 기업 포장 최적화를 실행하세요.": [
    "Register products and available cartons, then run enterprise packaging optimization.",
    "Đăng ký sản phẩm và thùng hiện có, rồi tối ưu đóng gói doanh nghiệp."
  ],
  "제품→박스 자동설계": [
    "Product → carton auto-design",
    "Tự thiết kế sản phẩm → thùng"
  ],
  "제품 코드와 제품명을 입력하세요.": [
    "Enter a product code and name.",
    "Nhập mã và tên sản phẩm."
  ],
  "이미 등록된 제품 코드입니다: {0}": [
    "Product code already registered: {0}",
    "Mã sản phẩm đã đăng ký: {0}"
  ],
  "제품 치수와 중량은 0보다 커야 합니다.": [
    "Product dimensions and weight must be greater than 0.",
    "Kích thước và khối lượng sản phẩm phải lớn hơn 0."
  ],
  "제품 수량과 박스당 최대EA는 1 이상의 정수여야 합니다.": [
    "Product quantity and maximum units per carton must be integers of at least 1.",
    "Số lượng sản phẩm và số đơn vị tối đa mỗi thùng phải là số nguyên từ 1."
  ],
  "벽 완충여유와 제품 간격은 0 이상, 내부 최대적층은 0(자동) 또는 1 이상의 정수여야 합니다.": [
    "Wall cushioning and product gaps must be nonnegative; internal stack limit must be 0 (auto) or an integer of at least 1.",
    "Đệm thành và khe sản phẩm phải không âm; giới hạn tầng trong thùng là 0 (tự động) hoặc số nguyên từ 1."
  ],
  "{0} 제품 조건을 수정했습니다. 다시 최적화하세요.": [
    "Updated conditions for product {0}. Run optimization again.",
    "Đã sửa điều kiện sản phẩm {0}. Hãy tối ưu lại."
  ],
  "{0} 제품을 등록했습니다.": [
    "Registered product {0}.",
    "Đã đăng ký sản phẩm {0}."
  ],
  "박스 코드와 이름을 입력하세요.": [
    "Enter a carton code and name.",
    "Nhập mã và tên thùng."
  ],
  "이미 등록된 박스 코드입니다: {0}": [
    "Carton code already registered: {0}",
    "Mã thùng đã đăng ký: {0}"
  ],
  "박스 치수·자중·최대총중량을 확인하세요.": [
    "Check carton dimensions, tare weight and maximum gross weight.",
    "Kiểm tra kích thước, khối lượng vỏ và tổng khối lượng tối đa của thùng."
  ],
  "박스 외부 치수는 내부 치수보다 작을 수 없습니다.": [
    "Outer carton dimensions cannot be smaller than inner dimensions.",
    "Kích thước ngoài thùng không được nhỏ hơn kích thước trong."
  ],
  "상부 허용중량은 빈칸(제한없음) 또는 0 이상의 값이어야 합니다.": [
    "Permitted top load must be blank (unlimited) or nonnegative.",
    "Tải phía trên cho phép phải để trống (không giới hạn) hoặc không âm."
  ],
  "박스 단가는 빈칸 또는 0 이상의 값이어야 합니다.": [
    "Carton unit price must be blank or nonnegative.",
    "Đơn giá thùng phải để trống hoặc không âm."
  ],
  "{0} 박스 조건을 수정했습니다. 다시 최적화하세요.": [
    "Updated conditions for carton {0}. Run optimization again.",
    "Đã sửa điều kiện thùng {0}. Hãy tối ưu lại."
  ],
  "{0} 박스를 등록했습니다.": [
    "Registered carton {0}.",
    "Đã đăng ký thùng {0}."
  ],
  "먼저 제품을 1개 이상 등록하세요.": [
    "Register at least 1 product first.",
    "Đăng ký ít nhất 1 sản phẩm trước."
  ],
  "목표 컨테이너 규격과 최대중량을 확인하세요.": [
    "Check target container dimensions and maximum weight.",
    "Kiểm tra kích thước container mục tiêu và khối lượng tối đa."
  ],
  "· 확인 필요 {0}종": [
    "· {0} types need review",
    "· Cần kiểm tra {0} loại"
  ],
  "제품 {0}종 포장설계 완료 · 박스 {1}EA · 예상 컨테이너 {2}대{3}": [
    "Packaging designed for {0} products · {1} cartons · Estimated {2} containers{3}",
    "Đã thiết kế đóng gói {0} sản phẩm · {1} thùng · Dự kiến {2} container{3}"
  ],
  "적용할 설계 결과가 없습니다.": [
    "No design result to apply.",
    "Không có kết quả thiết kế để áp dụng."
  ],
  "자동설계 {0}종은 강도 미검증 상태이므로 실제 적재에는 1단으로 적용됩니다.": [
    "{0} auto-designed sizes have unverified strength and are limited to 1 layer for actual loading.",
    "{0} quy cách tự thiết kế chưa được xác minh độ bền, nên giới hạn 1 tầng khi xếp thực tế."
  ],
  "현재 메인 화물 목록을 최적 포장박스 {0}EA로 교체할까요?{1}": [
    "Replace the main cargo list with {0} optimized cartons?{1}",
    "Thay danh sách hàng chính bằng {0} thùng tối ưu?{1}"
  ],
  "메인 적재 화면에 {0}개 화물행 · {1}EA 포장박스를 적용했습니다. 물리 최적 자동 적재와 관성 검증을 다시 실행하세요.": [
    "Applied {0} cargo rows and {1} cartons to the main loading view. Rerun physical optimization and inertia verification.",
    "Đã áp dụng {0} dòng hàng và {1} thùng vào màn hình xếp hàng chính. Chạy lại tối ưu vật lý và kiểm tra quán tính."
  ],
  "제품 A": [
    "Product A",
    "Sản phẩm A"
  ],
  "제품 B": [
    "Product B",
    "Sản phẩm B"
  ],
  "파손주의 C": [
    "Fragile C",
    "Dễ vỡ C"
  ],
  "샘플 제품/박스 데이터를 불러왔습니다. 기업 포장 최적화를 실행해보세요.": [
    "Loaded sample products/cartons. Try enterprise packaging optimization.",
    "Đã tải sản phẩm/thùng mẫu. Hãy thử tối ưu đóng gói doanh nghiệp."
  ],
  "기업 제품 포장박스 자동 설계": [
    "Enterprise product carton auto-design",
    "Tự thiết kế thùng sản phẩm doanh nghiệp"
  ],
  "제품 목록 → 공용 박스 최소화 → 컨테이너 최적 적재": [
    "Product list → Minimize shared cartons → Optimal container loading",
    "Danh mục sản phẩm → Giảm thùng dùng chung → Xếp container tối ưu"
  ],
  "제품 취급조건, 보유 박스, 신규 규격, 잔량 혼합, 컨테이너 적재율과 비용을 한 번에 계산합니다.": [
    "Calculate handling conditions, existing cartons, new sizes, mixed remainders, container utilization and costs together.",
    "Tính đồng thời điều kiện xử lý, thùng hiện có, quy cách mới, hàng dư hỗn hợp, tỷ lệ xếp container và chi phí."
  ],
  "샘플 불러오기": [
    "Load samples",
    "Tải dữ liệu mẫu"
  ],
  "기업 포장 최적화": [
    "Enterprise packaging optimization",
    "Tối ưu đóng gói doanh nghiệp"
  ],
  "1. 목표 컨테이너 / 자동설계": [
    "1. Target container / Auto-design",
    "1. Container mục tiêu / Tự thiết kế"
  ],
  "최대중량(kg)": [
    "Maximum weight (kg)",
    "Khối lượng tối đa (kg)"
  ],
  "자동설계 최대총중량": [
    "Auto-design maximum gross weight",
    "Tổng khối lượng tối đa khi tự thiết kế"
  ],
  "자동설계 박스단가": [
    "Auto-designed carton unit price",
    "Đơn giá thùng tự thiết kế"
  ],
  "컨테이너 맞춤 신규 박스 자동설계": [
    "Auto-design new container-specific cartons",
    "Tự thiết kế thùng mới theo container"
  ],
  "여러 제품의 공용 박스 규격 최소화": [
    "Minimize shared carton sizes across products",
    "Giảm số quy cách thùng dùng chung giữa các sản phẩm"
  ],
  "출하 잔량 혼합박스 허용": [
    "Allow mixed remainder cartons",
    "Cho phép thùng hỗn hợp hàng dư"
  ],
  "목표 박스 규격 수": [
    "Target number of carton sizes",
    "Số quy cách thùng mục tiêu"
  ],
  "허용 효율손실(%)": [
    "Permitted efficiency loss (%)",
    "Tổn thất hiệu suất cho phép (%)"
  ],
  "2. 비용 모델": [
    "2. Cost model",
    "2. Mô hình chi phí"
  ],
  "선택 입력": [
    "Optional",
    "Tùy chọn"
  ],
  "통화": [
    "Currency",
    "Tiền tệ"
  ],
  "컨테이너 1대 운임": [
    "Freight per container",
    "Cước mỗi container"
  ],
  "박스당 작업비": [
    "Labor per carton",
    "Công lao động mỗi thùng"
  ],
  "신규규격 셋업비/종": [
    "Setup per new size",
    "Chi phí thiết lập mỗi quy cách mới"
  ],
  "박스 SKU 관리비/종": [
    "Carton SKU management per size",
    "Quản lý SKU thùng mỗi quy cách"
  ],
  "단가가 비어 있는 박스는 비용합계에서 0으로 가정하지 않고 ‘미가격 박스’로 별도 집계합니다.": [
    "Cartons without a unit price are counted separately as unpriced cartons; they are not assumed to cost zero.",
    "Thùng chưa có đơn giá được tính riêng là thùng chưa định giá; không mặc định chi phí bằng 0."
  ],
  "3. 기업 제품 목록": [
    "3. Company product list",
    "3. Danh mục sản phẩm công ty"
  ],
  "중량(kg)": [
    "Weight (kg)",
    "Khối lượng (kg)"
  ],
  "수량": [
    "Quantity",
    "Số lượng"
  ],
  "박스당 최대EA": [
    "Maximum units/carton",
    "Số đơn vị tối đa/thùng"
  ],
  "회전정책": [
    "Orientation policy",
    "Quy tắc xoay"
  ],
  "세워서만": [
    "Upright only",
    "Chỉ đặt đứng"
  ],
  "바닥면 90°": [
    "90° floor rotation",
    "Xoay đáy 90°"
  ],
  "3축 회전 허용": [
    "Allow 3-axis rotation",
    "Cho phép xoay 3 trục"
  ],
  "박스 벽 완충여유(mm)": [
    "Carton wall cushioning (mm)",
    "Đệm thành thùng (mm)"
  ],
  "제품 간격(mm)": [
    "Product gap (mm)",
    "Khe giữa sản phẩm (mm)"
  ],
  "내부 최대적층": [
    "Maximum internal layers",
    "Số tầng tối đa trong thùng"
  ],
  "0=자동": [
    "0 = auto",
    "0 = tự động"
  ],
  "파손주의": [
    "Fragile",
    "Dễ vỡ"
  ],
  "잔량 혼합포장 허용": [
    "Allow mixed remainder packing",
    "Cho phép đóng gói hỗn hợp hàng dư"
  ],
  "수정 취소": [
    "Cancel changes",
    "Hủy sửa đổi"
  ],
  "· 벽 완충": [
    "· Wall cushioning",
    "· Đệm thành"
  ],
  "mm · 제품 간격": [
    "mm · Product gap",
    "mm · Khe sản phẩm"
  ],
  "· 파손주의": [
    "· Fragile",
    "· Dễ vỡ"
  ],
  "{0} 삭제": [
    "Delete {0}",
    "Xóa {0}"
  ],
  "등록된 제품이 없습니다.": [
    "No registered products.",
    "Chưa đăng ký sản phẩm."
  ],
  "4. 회사 보유 박스 카탈로그": [
    "4. Company carton catalog",
    "4. Danh mục thùng công ty"
  ],
  "미등록 시 자동설계만 사용": [
    "Without registered cartons, use auto-design only",
    "Chưa đăng ký thùng: chỉ dùng tự thiết kế"
  ],
  "박스코드": [
    "Carton code",
    "Mã thùng"
  ],
  "내부L": [
    "Inner L",
    "Dài trong"
  ],
  "내부W": [
    "Inner W",
    "Rộng trong"
  ],
  "내부H": [
    "Inner H",
    "Cao trong"
  ],
  "외부L": [
    "Outer L",
    "Dài ngoài"
  ],
  "외부W": [
    "Outer W",
    "Rộng ngoài"
  ],
  "외부H": [
    "Outer H",
    "Cao ngoài"
  ],
  "박스자중kg": [
    "Carton tare kg",
    "Khối lượng vỏ kg"
  ],
  "최대총중량kg": [
    "Maximum gross kg",
    "Tổng khối lượng tối đa kg"
  ],
  "상부허용kg": [
    "Permitted top load kg",
    "Tải phía trên cho phép kg"
  ],
  "제한 없음": [
    "Unlimited",
    "Không giới hạn"
  ],
  "박스단가": [
    "Carton unit price",
    "Đơn giá thùng"
  ],
  "미입력": [
    "Unspecified",
    "Chưa nhập"
  ],
  "박스 수정 저장": [
    "Save carton changes",
    "Lưu sửa đổi thùng"
  ],
  "보유 박스 등록": [
    "Register available carton",
    "Đăng ký thùng hiện có"
  ],
  "외부": [
    "Outer",
    "Ngoài"
  ],
  "mm · 최대": [
    "mm · Maximum",
    "mm · Tối đa"
  ],
  "kg · 상부": [
    "kg · Top load",
    "kg · Tải phía trên"
  ],
  "제한없음": [
    "Unlimited",
    "Không giới hạn"
  ],
  "단가 미입력": [
    "Price unspecified",
    "Chưa nhập đơn giá"
  ],
  "{0} 박스를 삭제했습니다.": [
    "Deleted carton {0}.",
    "Đã xóa thùng {0}."
  ],
  "보유 박스 미등록 · 자동설계만 사용할 수 있습니다.": [
    "No registered cartons · Auto-design only.",
    "Chưa đăng ký thùng · Chỉ dùng tự thiết kế."
  ],
  "기업 포장 최적화 결과": [
    "Enterprise packaging optimization results",
    "Kết quả tối ưu đóng gói doanh nghiệp"
  ],
  "제품": [
    "Product",
    "Sản phẩm"
  ],
  "종 · 최종 박스": [
    "types · Final cartons",
    "loại · Thùng cuối cùng"
  ],
  "EA · 정확중량": [
    "EA · Exact weight",
    "EA · Khối lượng chính xác"
  ],
  "메인 적재에 적용": [
    "Apply to main loading",
    "Áp dụng vào xếp hàng chính"
  ],
  "박스 규격 수": [
    "Carton sizes",
    "Số quy cách thùng"
  ],
  "{0}종 절감": [
    "{0} fewer sizes",
    "Giảm {0} quy cách"
  ],
  "유지": [
    "Unchanged",
    "Giữ nguyên"
  ],
  "출하 박스 수": [
    "Shipment carton count",
    "Số thùng xuất hàng"
  ],
  "혼합 잔량으로 {0}EA 절감": [
    "Mixed remainders save {0} cartons",
    "Gộp hàng dư tiết kiệm {0} thùng"
  ],
  "잔량 절감 없음": [
    "No remainder savings",
    "Không giảm nhờ gộp hàng dư"
  ],
  "예상 컨테이너": [
    "Estimated containers",
    "Số container dự kiến"
  ],
  "대": [
    "units",
    "chiếc"
  ],
  "전량 적재 가능": [
    "All units can be loaded",
    "Có thể xếp toàn bộ"
  ],
  "미적재 {0}EA": [
    "{0} units not loaded",
    "Chưa xếp {0} đơn vị"
  ],
  "공용화 평균 효율손실": [
    "Average shared-size efficiency loss",
    "Tổn thất hiệu suất trung bình khi dùng chung"
  ],
  "목표 {0}종 초과 · 안전규격 추가": [
    "Exceeds target of {0} sizes · Extra safe sizes",
    "Vượt mục tiêu {0} quy cách · Bổ sung quy cách an toàn"
  ],
  "목표 범위 충족": [
    "Within target",
    "Đạt phạm vi mục tiêu"
  ],
  "확인 가능한 총비용": [
    "Known total cost",
    "Tổng chi phí xác định được"
  ],
  "단가 미입력 박스 {0}EA 별도": [
    "{0} unpriced cartons counted separately",
    "Tính riêng {0} thùng chưa có đơn giá"
  ],
  "모든 박스 단가 반영": [
    "All carton prices included",
    "Đã tính đơn giá tất cả thùng"
  ],
  "선정 박스": [
    "Selected carton",
    "Thùng được chọn"
  ],
  "박스 외경": [
    "Carton outer dimensions",
    "Kích thước ngoài thùng"
  ],
  "입수": [
    "Units/carton",
    "Số đơn vị/thùng"
  ],
  "필요 박스": [
    "Required cartons",
    "Thùng cần dùng"
  ],
  "총중량/Full": [
    "Gross weight/full carton",
    "Tổng khối lượng/thùng đầy"
  ],
  "충진율": [
    "Fill rate",
    "Tỷ lệ lấp đầy"
  ],
  "컨테이너 효율": [
    "Container efficiency",
    "Hiệu suất container"
  ],
  "설계 적층": [
    "Designed layers",
    "Số tầng thiết kế"
  ],
  "실적용 적층": [
    "Applied layers",
    "Số tầng áp dụng"
  ],
  "강도": [
    "Strength",
    "Độ bền"
  ],
  "자동/공용설계": [
    "Auto/shared design",
    "Tự thiết kế/thiết kế chung"
  ],
  "보유박스": [
    "Available carton",
    "Thùng hiện có"
  ],
  "미검증 · 목표": [
    "Unverified · Target",
    "Chưa xác minh · Mục tiêu"
  ],
  "선정된 공용 박스 패밀리": [
    "Selected shared carton family",
    "Nhóm thùng dùng chung được chọn"
  ],
  "혼합 잔량 박스": [
    "Mixed remainder cartons",
    "Thùng hỗn hợp hàng dư"
  ],
  "kg · 충진율": [
    "kg · Fill rate",
    "kg · Tỷ lệ lấp đầy"
  ],
  "비용 구성": [
    "Cost breakdown",
    "Cơ cấu chi phí"
  ],
  "박스비": [
    "Carton cost",
    "Chi phí thùng"
  ],
  "작업비": [
    "Labor cost",
    "Chi phí lao động"
  ],
  "신규규격 셋업": [
    "New-size setup",
    "Thiết lập quy cách mới"
  ],
  "박스 SKU 관리": [
    "Carton SKU management",
    "Quản lý SKU thùng"
  ],
  "운임": [
    "Freight",
    "Cước vận chuyển"
  ],
  "설계 제외": [
    "Excluded from design",
    "Loại khỏi thiết kế"
  ],
  "컨테이너 적재 미완료": [
    "Container loading incomplete",
    "Chưa xếp xong container"
  ],
  "자동설계 강도 원칙:": [
    "Auto-design strength policy:",
    "Quy tắc độ bền khi tự thiết kế:"
  ],
  "자동/공용 신규규격의 상부하중은 제조 요구치일 뿐 인증값이 아닙니다. 강도 확인 전 메인 적재에는 1단·상부허용 0kg로 적용됩니다. 실제 원지·골종·ECT/BCT·습도·테이핑 조건을 검증한 뒤 보유박스 카탈로그에 상부허용중량을 등록하세요.": [
    "Top-load values for new auto/shared designs are manufacturing requirements, not certified strengths. Until verified, main loading uses 1 layer and 0 kg permitted top load. Verify paper grade, flute, ECT/BCT, humidity and taping, then register the permitted top load in the carton catalog.",
    "Tải phía trên của quy cách tự thiết kế/dùng chung mới là yêu cầu sản xuất, không phải độ bền được chứng nhận. Trước khi xác minh, xếp hàng chính áp dụng 1 tầng và tải phía trên cho phép 0 kg. Kiểm tra giấy, sóng, ECT/BCT, độ ẩm và băng dán, rồi đăng ký tải phía trên cho phép trong danh mục thùng."
  ],
  "균형 최적화": [
    "Balanced optimization",
    "Tối ưu cân bằng"
  ],
  "컨테이너 대수 최소": [
    "Minimize containers",
    "Giảm số container"
  ],
  "박스 SKU 최소": [
    "Minimize carton SKUs",
    "Giảm SKU thùng"
  ],
  "총비용 최소": [
    "Minimize total cost",
    "Giảm tổng chi phí"
  ],
  "기업 포장 입력이 변경되었습니다. 전략 자동비교를 다시 실행하세요.": [
    "Enterprise packaging inputs changed. Rerun the strategy comparison.",
    "Đầu vào đóng gói doanh nghiệp đã thay đổi. Chạy lại so sánh chiến lược."
  ],
  "제품 목록을 먼저 등록하거나 Excel로 불러오세요.": [
    "Register products or import them from Excel first.",
    "Đăng ký sản phẩm hoặc nhập từ Excel trước."
  ],
  "{0} 추천 · 컨테이너 {1}대 · 박스 {2}EA · 규격 {3}종": [
    "Recommended: {0} · {1} containers · {2} cartons · {3} sizes",
    "Đề xuất: {0} · {1} container · {2} thùng · {3} quy cách"
  ],
  "추천 전략을 메인 적재에 적용할까요?\n{0} · 박스 {1}EA · 컨테이너 {2}대{3}": [
    "Apply the recommended strategy to main loading?\n{0} · {1} cartons · {2} containers{3}",
    "Áp dụng chiến lược đề xuất vào xếp hàng chính?\n{0} · {1} thùng · {2} container{3}"
  ],
  "추천 포장계획을 메인 적재에 적용했습니다. 다음 단계에서 물리 최적화와 관성 검증을 다시 실행하세요.": [
    "Applied the recommended packaging plan. Rerun physical optimization and inertia verification in the next step.",
    "Đã áp dụng kế hoạch đóng gói đề xuất. Chạy lại tối ưu vật lý và kiểm tra quán tính ở bước tiếp theo."
  ],
  "기업 포장 전략 자동 비교": [
    "Enterprise packaging strategy comparison",
    "So sánh chiến lược đóng gói doanh nghiệp"
  ],
  "포장 전략 자동 비교": [
    "Compare packaging strategies",
    "So sánh chiến lược đóng gói"
  ],
  "같은 제품을 여러 박스 패밀리/잔량 방식으로 다시 계산해 목적에 맞는 추천안을 선택합니다.": [
    "Recalculate the same products with different carton families and remainder policies to select a plan for your objective.",
    "Tính lại cùng sản phẩm với các nhóm thùng và cách xử lý hàng dư khác nhau để chọn phương án phù hợp mục tiêu."
  ],
  "최적화 기준": [
    "Optimization objective",
    "Mục tiêu tối ưu"
  ],
  "전략 자동비교": [
    "Compare strategies",
    "So sánh chiến lược"
  ],
  "박스 단가가 비어 있는 항목이 있어 완전한 최저비용 비교는 불가능합니다. 미가격 박스 수가 적은 시나리오를 우선한 뒤 확인 가능한 비용을 비교했습니다.": [
    "Some cartons have no unit price, so a complete minimum-cost comparison is unavailable. Scenarios with fewer unpriced cartons are preferred, then known costs are compared.",
    "Một số thùng chưa có đơn giá nên chưa thể so sánh đầy đủ chi phí tối thiểu. Ưu tiên phương án có ít thùng chưa định giá, rồi so sánh chi phí xác định được."
  ],
  "박스": [
    "Carton",
    "Thùng"
  ],
  "박스 규격": [
    "Carton specification",
    "Quy cách thùng"
  ],
  "확인 비용": [
    "Known cost",
    "Chi phí xác định được"
  ],
  "미가격": [
    "Unpriced",
    "Chưa định giá"
  ],
  "추천안 Excel": [
    "Recommended plan Excel",
    "Excel phương án đề xuất"
  ],
  "추천안 메인 적용": [
    "Apply recommended plan",
    "Áp dụng phương án đề xuất"
  ],
  "순위": [
    "Rank",
    "Xếp hạng"
  ],
  "목표 규격": [
    "Target sizes",
    "Quy cách mục tiêu"
  ],
  "잔량 혼합": [
    "Mixed remainders",
    "Gộp hàng dư"
  ],
  "실제 규격": [
    "Actual sizes",
    "Quy cách thực tế"
  ],
  "박스수": [
    "Carton count",
    "Số thùng"
  ],
  "효율손실": [
    "Efficiency loss",
    "Tổn thất hiệu suất"
  ],
  "확인비용": [
    "Known cost",
    "Chi phí xác định được"
  ],
  "허용": [
    "Allowed",
    "Cho phép"
  ],
  "전용": [
    "Dedicated",
    "Riêng"
  ],
  "제조사 강도 검증이 끝난 자동설계 박스를 승인할 수 있습니다.": [
    "Approve auto-designed cartons after manufacturer strength verification.",
    "Phê duyệt thùng tự thiết kế sau khi nhà sản xuất xác minh độ bền."
  ],
  "기업 포장 입력이 변경되었습니다. 승인 대기 규격을 다시 불러오세요.": [
    "Enterprise packaging inputs changed. Reload sizes awaiting approval.",
    "Đầu vào đóng gói doanh nghiệp đã thay đổi. Tải lại quy cách chờ phê duyệt."
  ],
  "먼저 기업 제품 목록을 등록하고 포장 최적화를 실행하세요.": [
    "Register company products and run packaging optimization first.",
    "Đăng ký sản phẩm công ty và chạy tối ưu đóng gói trước."
  ],
  "강도 미검증 물리규격 {0}종 · 적용 제품 {1}종을 찾았습니다.": [
    "Found {0} physical sizes with unverified strength for {1} products.",
    "Tìm thấy {0} quy cách chưa xác minh độ bền cho {1} sản phẩm."
  ],
  "현재 승인 대기 중인 자동설계 규격이 없습니다.": [
    "No auto-designed sizes are awaiting approval.",
    "Không có quy cách tự thiết kế đang chờ phê duyệt."
  ],
  "승인할 자동설계 규격을 선택하세요.": [
    "Select an auto-designed size to approve.",
    "Chọn quy cách tự thiết kế để phê duyệt."
  ],
  "이미 존재하는 박스 코드입니다: {0}": [
    "Carton code already exists: {0}",
    "Mã thùng đã tồn tại: {0}"
  ],
  "{0} 검증 박스를 회사 카탈로그에 등록했습니다. 제품 {1}종 공용 · 가장 무거운 Full {2}kg · 보수적 최대 {3}단 후보입니다. 전체 포장 최적화를 다시 실행하세요.": [
    "Registered verified carton {0} in the company catalog. Shared by {1} products · Heaviest full carton {2} kg · Conservative candidate limit {3} layers. Rerun full packaging optimization.",
    "Đã đăng ký thùng đã xác minh {0} vào danh mục công ty. Dùng chung cho {1} sản phẩm · Thùng đầy nặng nhất {2} kg · Giới hạn bảo thủ dự kiến {3} tầng. Chạy lại tối ưu đóng gói toàn bộ."
  ],
  "자동설계 박스 제조 강도 승인": [
    "Approve auto-designed carton manufacturing strength",
    "Phê duyệt độ bền sản xuất thùng tự thiết kế"
  ],
  "자동설계 박스 제조 검증 승인": [
    "Approve manufacturing verification for auto-designed cartons",
    "Phê duyệt xác minh sản xuất thùng tự thiết kế"
  ],
  "같은 물리 규격을 여러 제품이 공유하면 한 번만 승인합니다. 제조사·포장시험에서 확인한 실제 자중/강도 값을 입력해야 보유박스로 승격됩니다.": [
    "Approve a physical size once when shared by multiple products. Enter actual tare weight and strength verified by the manufacturer or packaging tests before it becomes an available carton.",
    "Phê duyệt một lần khi nhiều sản phẩm dùng cùng quy cách. Nhập khối lượng vỏ và độ bền thực tế đã được nhà sản xuất hoặc thử nghiệm xác minh để chuyển thành thùng hiện có."
  ],
  "승인 대기 규격 불러오기": [
    "Load sizes awaiting approval",
    "Tải quy cách chờ phê duyệt"
  ],
  "적용 제품": [
    "Applicable products",
    "Sản phẩm áp dụng"
  ],
  "자동계산 최대 요구": [
    "Calculated maximum requirement",
    "Yêu cầu tối đa được tính"
  ],
  "kg · 승인값 아님": [
    "kg · Not an approved value",
    "kg · Không phải giá trị đã phê duyệt"
  ],
  "mm 공용규격": [
    "mm shared size",
    "mm quy cách dùng chung"
  ],
  "적용 제품:": [
    "Applicable products:",
    "Sản phẩm áp dụng:"
  ],
  "제품별 실제 Full 중량은 입력한 실제 박스 자중으로 재계산됩니다.": [
    "Each product's actual full-carton weight is recalculated using the entered actual carton tare weight.",
    "Khối lượng thùng đầy thực tế của mỗi sản phẩm được tính lại bằng khối lượng vỏ thực tế đã nhập."
  ],
  "승인 박스 코드": [
    "Approved carton code",
    "Mã thùng phê duyệt"
  ],
  "완성 박스 실제 자중(kg)": [
    "Actual finished carton tare (kg)",
    "Khối lượng vỏ thùng hoàn thiện thực tế (kg)"
  ],
  "필수 입력": [
    "Required",
    "Bắt buộc"
  ],
  "제조사 검증 최대총중량(kg)": [
    "Manufacturer-verified maximum gross weight (kg)",
    "Tổng khối lượng tối đa do nhà sản xuất xác minh (kg)"
  ],
  "제조사 검증 상부허용중량(kg)": [
    "Manufacturer-verified permitted top load (kg)",
    "Tải phía trên cho phép do nhà sản xuất xác minh (kg)"
  ],
  "실제 박스 단가": [
    "Actual carton unit price",
    "Đơn giá thùng thực tế"
  ],
  "선택": [
    "Optional",
    "Tùy chọn"
  ],
  "제조 치수 단위": [
    "Manufacturing dimension increment",
    "Bước kích thước sản xuất"
  ],
  "검증 박스로 승인 등록": [
    "Register as a verified carton",
    "Đăng ký thùng đã xác minh"
  ],
  "승인 시 이 규격을 쓰는 모든 제품의 실제 Full 중량을 다시 계산하며, 가장 무거운 제품이 최대총중량을 넘으면 승인하지 않습니다. 외경은 선택한 제조 단위로 바깥쪽 올림됩니다.": [
    "Approval recalculates actual full-carton weights for every product using this size. Approval is blocked if the heaviest product exceeds maximum gross weight. Outer dimensions round up to the chosen manufacturing increment.",
    "Khi phê duyệt, tính lại khối lượng thùng đầy cho mọi sản phẩm dùng quy cách này. Chặn phê duyệt nếu sản phẩm nặng nhất vượt tổng khối lượng tối đa. Kích thước ngoài được làm tròn lên theo bước sản xuất đã chọn."
  ],
  "제품 목록과 보유 박스를 등록한 뒤 자동설계를 실행하세요.": [
    "Register products and available cartons, then run auto-design.",
    "Đăng ký sản phẩm và thùng hiện có, rồi chạy tự thiết kế."
  ],
  "제품 치수·중량은 0보다 커야 하고 수량은 정수여야 합니다.": [
    "Product dimensions and weight must be positive, and quantity must be an integer.",
    "Kích thước và khối lượng sản phẩm phải dương, số lượng phải là số nguyên."
  ],
  "박스 치수·중량·상부 허용중량을 확인하세요.": [
    "Check carton dimensions, weight and permitted top load.",
    "Kiểm tra kích thước, khối lượng và tải phía trên cho phép của thùng."
  ],
  "{0}개 제품 설계 완료 · {1}개 제품 확인 필요": [
    "Designed {0} products · {1} products need review",
    "Đã thiết kế {0} sản phẩm · Cần kiểm tra {1} sản phẩm"
  ],
  "{0}개 제품의 최적 박스 설계를 완료했습니다.": [
    "Completed optimal carton designs for {0} products.",
    "Đã hoàn tất thiết kế thùng tối ưu cho {0} sản phẩm."
  ],
  "현재 메인 화물 목록을 최적 포장박스 {0}EA로 교체할까요?": [
    "Replace the main cargo list with {0} optimized cartons?",
    "Thay danh sách hàng chính bằng {0} thùng tối ưu?"
  ],
  "메인 적재 화면에 {0}종 · {1}EA 포장박스를 적용했습니다. 이제 물리 최적 자동 적재를 실행하세요.": [
    "Applied {0} types and {1} cartons to the main loading view. Run physical auto-loading next.",
    "Đã áp dụng {0} loại và {1} thùng vào màn hình xếp hàng chính. Tiếp theo hãy chạy tự xếp tối ưu vật lý."
  ],
  "샘플 제품/박스 데이터를 불러왔습니다. 자동설계를 실행해보세요.": [
    "Loaded sample products/cartons. Try auto-design.",
    "Đã tải sản phẩm/thùng mẫu. Hãy thử tự thiết kế."
  ],
  "제품 목록 → 최적 포장박스 → 컨테이너 적재": [
    "Product list → Optimal packaging cartons → Container loading",
    "Danh mục sản phẩm → Thùng đóng gói tối ưu → Xếp container"
  ],
  "보유 박스를 자동 매칭하고, 더 좋은 규격이 있으면 컨테이너 적재 효율을 기준으로 새 박스 규격까지 설계합니다.": [
    "Automatically match available cartons and design better sizes based on container loading efficiency.",
    "Tự động ghép thùng hiện có và thiết kế quy cách tốt hơn theo hiệu suất xếp container."
  ],
  "자동 박스 설계": [
    "Auto-design cartons",
    "Tự thiết kế thùng"
  ],
  "1. 목표 컨테이너": [
    "1. Target container",
    "1. Container mục tiêu"
  ],
  "컨테이너 맞춤형 새 박스 규격도 자동 설계": [
    "Auto-design new carton sizes for the container",
    "Tự thiết kế quy cách thùng mới cho container"
  ],
  "자동설계 박스 최대 총중량(kg)": [
    "Auto-designed carton maximum gross weight (kg)",
    "Tổng khối lượng tối đa của thùng tự thiết kế (kg)"
  ],
  "2. 기업 제품 목록": [
    "2. Company product list",
    "2. Danh mục sản phẩm công ty"
  ],
  "3. 회사 보유 박스 카탈로그": [
    "3. Company carton catalog",
    "3. Danh mục thùng công ty"
  ],
  "등록하지 않아도 자동설계 가능": [
    "Auto-design available without registration",
    "Có thể tự thiết kế khi chưa đăng ký"
  ],
  "상부": [
    "Top load",
    "Tải phía trên"
  ],
  "최적 포장 설계 결과": [
    "Optimal packaging design results",
    "Kết quả thiết kế đóng gói tối ưu"
  ],
  "종 → 포장박스 총": [
    "types → Total cartons",
    "loại → Tổng số thùng"
  ],
  "EA · 신규 자동설계": [
    "EA · New auto-designed",
    "EA · Tự thiết kế mới"
  ],
  "총중량/박스": [
    "Gross weight/carton",
    "Tổng khối lượng/thùng"
  ],
  "제품 충진율": [
    "Product fill rate",
    "Tỷ lệ lấp đầy sản phẩm"
  ],
  "컨테이너 타일효율": [
    "Container tiling efficiency",
    "Hiệu suất bố trí container"
  ],
  "시뮬 적재": [
    "Simulated loading",
    "Xếp mô phỏng"
  ],
  "최대 적층": [
    "Maximum layers",
    "Số tầng tối đa"
  ],
  "설계요구 {0}kg": [
    "Design requirement {0} kg",
    "Yêu cầu thiết kế {0} kg"
  ],
  "자동설계 박스의 상부하중 값은 실제 박스 강도 인증값이 아니라, 해당 적층안을 사용하기 위해 박스가 충족해야 할 설계 요구치입니다. 실제 골판지 사양/압축강도는 박스 제조사 검증이 필요합니다.": [
    "Auto-designed carton top load is a design requirement for the proposed stack, not a certified strength. The manufacturer must verify actual corrugated-board specifications and compression strength.",
    "Tải phía trên của thùng tự thiết kế là yêu cầu thiết kế cho phương án xếp, không phải độ bền được chứng nhận. Nhà sản xuất phải xác minh quy cách carton sóng và độ bền nén thực tế."
  ],
  "{0} · 직접 적재": [
    "{0} · Direct loading",
    "{0} · Xếp trực tiếp"
  ],
  "회사 제품을 등록하고 출하 수량을 정한 뒤 박스를 추천받으세요.": [
    "Register company products, set shipment quantities, then request carton recommendations.",
    "Đăng ký sản phẩm công ty, đặt số lượng xuất hàng rồi yêu cầu đề xuất thùng."
  ],
  "최종 적재 완료 · {0}개 적재단위 · 미적재 {1}개 · 통합 출하·적재 작업지시서에 결과가 연결됩니다.": [
    "Final loading complete · {0} load units · {1} waiting · Results are linked to the integrated shipment/loading work order.",
    "Đã hoàn tất xếp hàng · {0} đơn vị xếp · {1} chưa xếp · Kết quả được liên kết với lệnh xuất hàng/xếp hàng tích hợp."
  ],
  "출하 수량은 1 이상의 정수여야 합니다.": [
    "Shipment quantity must be an integer of at least 1.",
    "Số lượng xuất hàng phải là số nguyên từ 1."
  ],
  "{0} 제품을 저장했습니다. {1}": [
    "Saved product {0}. {1}",
    "Đã lưu sản phẩm {0}. {1}"
  ],
  "등록 가능한 제품이 없습니다.{0}": [
    "No products can be registered.{0}",
    "Không có sản phẩm có thể đăng ký.{0}"
  ],
  "· 확인 {0}건": [
    "· {0} items need review",
    "· Cần kiểm tra {0} mục"
  ],
  "제품 엑셀 반영 완료 · 신규 {0}종 · 기존 갱신 {1}종{2}": [
    "Product Excel imported · {0} new types · {1} existing types updated{2}",
    "Đã nhập Excel sản phẩm · {0} loại mới · cập nhật {1} loại hiện có{2}"
  ],
  "제품 엑셀 파일을 읽지 못했습니다. 기초 엑셀 양식의 열 이름과 파일 형식을 확인하세요.": [
    "Could not read the product Excel file. Check template column names and file format.",
    "Không đọc được Excel sản phẩm. Kiểm tra tên cột theo mẫu và định dạng tệp."
  ],
  "출하 수량이 변경되어 박스 추천을 다시 계산해야 합니다.": [
    "Shipment quantities changed. Recalculate carton recommendations.",
    "Số lượng xuất hàng đã thay đổi. Tính lại đề xuất thùng."
  ],
  "회사 보유 박스 {0}종을 다시 불러왔습니다. 제품 비고의 적재 가능 여부도 갱신했습니다.": [
    "Reloaded {0} company carton sizes and refreshed product compatibility notes.",
    "Đã tải lại {0} quy cách thùng công ty và cập nhật ghi chú độ phù hợp của sản phẩm."
  ],
  "먼저 회사 제품을 1개 이상 등록하세요.": [
    "Register at least 1 company product first.",
    "Đăng ký ít nhất 1 sản phẩm công ty trước."
  ],
  "모든 제품이 박스 불필요로 설정되어 있습니다. 박스 추천 없이 바로 최종 적재를 실행할 수 있습니다.": [
    "All products are set to require no carton. You can run final loading without carton recommendations.",
    "Tất cả sản phẩm được đặt không cần thùng. Có thể chạy xếp hàng cuối cùng mà không cần đề xuất thùng."
  ],
  "박스 추천 완료 · 후보 {0}개 · 추천 불가 제품 {1}": [
    "Carton recommendations complete · {0} candidates · Products without recommendations: {1}",
    "Đã đề xuất thùng · {0} phương án · Sản phẩm không có đề xuất: {1}"
  ],
  "박스 추천 완료 · 박스 필요 제품별 최대 3개 후보 · 현재 1순위가 자동 선택되어 있습니다.": [
    "Carton recommendations complete · Up to 3 candidates per product · The first choice is selected automatically.",
    "Đã đề xuất thùng · Tối đa 3 phương án mỗi sản phẩm · Phương án đầu được tự chọn."
  ],
  "박스 적재가 필요한 모든 제품의 추천 박스를 하나씩 선택하세요.": [
    "Select one recommended carton for every product requiring carton packaging.",
    "Chọn một thùng đề xuất cho mỗi sản phẩm cần đóng thùng."
  ],
  "선택 완료 · 박스 포장 {0}BOX + 직접 적재 {1}EA · 총 {2}개 적재단위로 최종 계산을 시작합니다.": [
    "Selection complete · {0} cartons + {1} direct units · Starting final calculation for {2} load units.",
    "Đã chọn · {0} thùng + {1} đơn vị trực tiếp · Bắt đầu tính cuối cùng cho {2} đơn vị xếp."
  ],
  "회사 제품 박스 추천 및 최종 적재": [
    "Company product carton recommendations and final loading",
    "Đề xuất thùng và xếp hàng cuối cùng cho sản phẩm công ty"
  ],
  "회사 제품 → 박스 추천 → 선택 → 최종 적재": [
    "Company products → Carton recommendations → Selection → Final loading",
    "Sản phẩm công ty → Đề xuất thùng → Lựa chọn → Xếp hàng cuối cùng"
  ],
  "제품 실물 규격과 출하 수량, 박스 적재 필요 여부를 기준으로 포장 제품과 직접 적재 제품을 나눠 최종 적재까지 연결합니다.": [
    "Use actual product dimensions, shipment quantities and carton requirements to combine packaged and directly loaded products in the final load.",
    "Dùng kích thước thực, số lượng xuất hàng và yêu cầu đóng thùng để kết hợp sản phẩm đóng gói và xếp trực tiếp trong phương án cuối cùng."
  ],
  "진행 단계": [
    "Progress",
    "Tiến trình"
  ],
  "수량·포장 확정": [
    "Confirm quantity/packaging",
    "Xác nhận số lượng/đóng gói"
  ],
  "박스 추천·선택": [
    "Recommend/select cartons",
    "Đề xuất/chọn thùng"
  ],
  "최종 적재": [
    "Final loading",
    "Xếp hàng cuối cùng"
  ],
  "1. 회사 제품 등록": [
    "1. Register company products",
    "1. Đăng ký sản phẩm công ty"
  ],
  "한 번 등록한 제품은 다음 출하에서도 수량과 포장 방식만 바꿔 재사용합니다.": [
    "Reuse registered products for later shipments by changing quantities and packaging methods.",
    "Tái sử dụng sản phẩm đã đăng ký cho lần xuất hàng sau bằng cách đổi số lượng và cách đóng gói."
  ],
  "기초 엑셀 양식 다운로드": [
    "Download Excel template",
    "Tải mẫu Excel"
  ],
  "제품코드 · 제품명 · L/W/H · 중량 · 출하수량 · 박스적재필요 · 박스당 최대EA": [
    "Product code · Product name · L/W/H · Weight · Shipment quantity · Carton required · Maximum units/carton",
    "Mã sản phẩm · Tên sản phẩm · Dài/rộng/cao · Khối lượng · Số lượng xuất · Cần thùng · Số đơn vị tối đa/thùng"
  ],
  "회사 제품명": [
    "Company product name",
    "Tên sản phẩm công ty"
  ],
  "제품중량 kg": [
    "Product weight kg",
    "Khối lượng sản phẩm kg"
  ],
  "출하 수량 EA": [
    "Shipment quantity EA",
    "Số lượng xuất hàng EA"
  ],
  "제품 자체 직접 적재": [
    "Load product directly",
    "Xếp sản phẩm trực tiếp"
  ],
  "적합 박스 {0}종": [
    "{0} compatible carton sizes",
    "{0} quy cách thùng phù hợp"
  ],
  "현재 등록 박스 0종 적합": [
    "No currently registered cartons fit",
    "Không có thùng đã đăng ký phù hợp"
  ],
  "박스 등록 후 자동 판정": [
    "Checked automatically after carton registration",
    "Tự kiểm tra sau khi đăng ký thùng"
  ],
  "박스당 최대 {0}EA": [
    "Maximum {0} units/carton",
    "Tối đa {0} đơn vị/thùng"
  ],
  "출하수량": [
    "Shipment quantity",
    "Số lượng xuất hàng"
  ],
  "비고": [
    "Notes",
    "Ghi chú"
  ],
  "2. 제품별 박스 추천": [
    "2. Carton recommendations by product",
    "2. Đề xuất thùng theo sản phẩm"
  ],
  "박스 적재가 필요한 제품만 크기·수량·중량·컨테이너 효율을 비교합니다.": [
    "Compare dimensions, quantities, weights and container efficiency only for products requiring cartons.",
    "Chỉ so sánh kích thước, số lượng, khối lượng và hiệu suất container cho sản phẩm cần thùng."
  ],
  "회사 박스 목록 새로고침": [
    "Refresh company cartons",
    "Làm mới danh sách thùng công ty"
  ],
  "박스 추천 실행": [
    "Recommend cartons",
    "Đề xuất thùng"
  ],
  "회사 보유 박스가 아직 없으면 자동설계 박스를 추천합니다. 보유 박스의 내·외경과 허용중량은 아래 ‘고급 포장 설정 / 회사 박스 관리’에서 등록할 수 있습니다.": [
    "If no company cartons are available, auto-designed cartons are recommended. Register inner/outer dimensions and permitted weights under Advanced packaging settings / Company carton management below.",
    "Nếu chưa có thùng công ty, hệ thống đề xuất thùng tự thiết kế. Đăng ký kích thước trong/ngoài và tải cho phép tại Cài đặt đóng gói nâng cao / Quản lý thùng công ty bên dưới."
  ],
  "EA 출하": [
    "EA to ship",
    "EA xuất hàng"
  ],
  "제품 자체 규격": [
    "Product dimensions",
    "Kích thước sản phẩm"
  ],
  "mm로 직접 적재합니다. 안전상 기본 적층은 1단으로 적용됩니다.": [
    "mm for direct loading. The default safety limit is 1 layer.",
    "mm để xếp trực tiếp. Giới hạn an toàn mặc định là 1 tầng."
  ],
  "개 후보": [
    "candidates",
    "phương án"
  ],
  "대안": [
    "Alternative",
    "Phương án khác"
  ],
  "자동설계 박스": [
    "Auto-designed carton",
    "Thùng tự thiết kế"
  ],
  "· 박스당": [
    "· Per carton",
    "· Mỗi thùng"
  ],
  "EA · 총": [
    "EA · Total",
    "EA · Tổng"
  ],
  "제품 충진": [
    "Product fill",
    "Lấp đầy sản phẩm"
  ],
  "적재 예상": [
    "Expected loading",
    "Xếp hàng dự kiến"
  ],
  "이 제품에 맞는 박스를 찾지 못했습니다.": [
    "No suitable carton found for this product.",
    "Không tìm thấy thùng phù hợp cho sản phẩm này."
  ],
  "박스 추천 실행 후 후보가 표시됩니다.": [
    "Run carton recommendations to display candidates.",
    "Chạy đề xuất thùng để hiển thị phương án."
  ],
  "3. 선택 완료 → 최종 적재 실행": [
    "3. Finish selection → Run final loading",
    "3. Chọn xong → Chạy xếp hàng cuối cùng"
  ],
  "개 제품 선택 · 직접 적재": [
    "products selected · Direct loading",
    "sản phẩm đã chọn · Xếp trực tiếp"
  ],
  "종 · 포장박스": [
    "types · Packaging cartons",
    "loại · Thùng đóng gói"
  ],
  "최종 적재 계산 중…": [
    "Calculating final load…",
    "Đang tính xếp hàng cuối cùng…"
  ],
  "선택 완료 · 최종 적재 실행": [
    "Finish selection · Run final loading",
    "Chọn xong · Chạy xếp hàng cuối cùng"
  ],
  "내보낼 기업 포장계획이 없습니다. 먼저 포장 최적화를 실행하세요.": [
    "No enterprise packaging plan to export. Run packaging optimization first.",
    "Không có kế hoạch đóng gói doanh nghiệp để xuất. Chạy tối ưu đóng gói trước."
  ],
  "생성할 포장 작업지시서가 없습니다. 먼저 포장 최적화를 실행하세요.": [
    "No packaging work order to generate. Run packaging optimization first.",
    "Không có lệnh đóng gói để tạo. Chạy tối ưu đóng gói trước."
  ],
  "팝업이 차단되어 포장 작업지시서를 열지 못했습니다.": [
    "The packaging work order could not open because pop-ups are blocked.",
    "Không mở được lệnh đóng gói vì cửa sổ bật lên bị chặn."
  ],
  "포장 작업지시서": [
    "Packaging work order",
    "Lệnh đóng gói"
  ],
  "포장계획 Excel": [
    "Packaging plan Excel",
    "Excel kế hoạch đóng gói"
  ],
  "최대중량": [
    "Maximum weight",
    "Khối lượng tối đa"
  ],
  "바닥 허용하중(kg/m²)": [
    "Permitted floor load (kg/m²)",
    "Tải sàn cho phép (kg/m²)"
  ],
  "사용자 규격: {0}": [
    "Custom specifications: {0}",
    "Quy cách tùy chỉnh: {0}"
  ],
  "사용자 규격을 입력한 뒤 적용하세요.": [
    "Enter custom specifications, then apply.",
    "Nhập quy cách tùy chỉnh rồi áp dụng."
  ],
  "대시보드 컨테이너 입력칸을 찾지 못했습니다. 화면을 새로고침한 뒤 다시 적용하세요.": [
    "Could not find dashboard container fields. Refresh and try again.",
    "Không tìm thấy ô nhập container trên bảng điều khiển. Làm mới rồi thử lại."
  ],
  "{0}은 특수화물 전용 장비입니다. 박스 적재 결과는 참고용입니다.": [
    "{0} is for specialized cargo. Carton loading results are for reference only.",
    "{0} dành cho hàng chuyên dụng. Kết quả xếp thùng chỉ để tham khảo."
  ],
  "{0} 규격을 현재 적재계획에 적용했습니다. 자동 적재를 다시 실행하세요.": [
    "Applied {0} specifications to the current plan. Rerun automatic loading.",
    "Đã áp dụng quy cách {0} vào kế hoạch hiện tại. Chạy lại xếp tự động."
  ],
  "길이·폭·높이·적재중량·바닥하중을 모두 0보다 크게 입력하세요.": [
    "Length, width, height, payload and floor load must all be greater than 0.",
    "Chiều dài, rộng, cao, tải hàng và tải sàn đều phải lớn hơn 0."
  ],
  "사용자 등록 실차 제원": [
    "User-registered vehicle specifications",
    "Thông số xe do người dùng đăng ký"
  ],
  "대시보드 입력칸을 찾지 못했습니다.": [
    "Could not find dashboard input fields.",
    "Không tìm thấy ô nhập trên bảng điều khiển."
  ],
  "{0} 사용자 규격을 적용했습니다. 자동 적재를 다시 실행하세요.": [
    "Applied custom {0} specifications. Rerun automatic loading.",
    "Đã áp dụng quy cách tùy chỉnh {0}. Chạy lại xếp tự động."
  ],
  "컨테이너 및 트럭 유형": [
    "Container and truck types",
    "Loại container và xe tải"
  ],
  "장비를 선택하면 현재 제품/박스 목록은 유지하고 적재공간 규격과 최대 적재중량만 즉시 바꿉니다.": [
    "Selecting equipment keeps your product/carton list and immediately updates only the loading-space dimensions and maximum payload.",
    "Chọn phương tiện giữ nguyên danh sách sản phẩm/thùng và cập nhật ngay kích thước khoang cùng tải hàng tối đa."
  ],
  "▥ 컨테이너": [
    "▥ Containers",
    "▥ Container"
  ],
  "▰ 트럭": [
    "▰ Trucks",
    "▰ Xe tải"
  ],
  "국내 완성 특장차 대표 사양 · 치수는 화물실 내부 · 적재중량은 화물 허용중량. 대형 특장차는 실차 제원을 등록하세요.": [
    "Representative Korean completed truck specifications · Internal cargo-space dimensions · Cargo payload. Register actual specifications for large specialized trucks.",
    "Thông số xe tải hoàn thiện tiêu biểu tại Hàn Quốc · Kích thước trong khoang hàng · Tải hàng. Đăng ký thông số thực tế cho xe chuyên dụng lớn."
  ],
  "규격": [
    "Specifications",
    "Quy cách"
  ],
  "내부 길이(m)": [
    "Internal length (m)",
    "Chiều dài trong (m)"
  ],
  "내부 폭(m)": [
    "Internal width (m)",
    "Chiều rộng trong (m)"
  ],
  "내부 높이(m)": [
    "Internal height (m)",
    "Chiều cao trong (m)"
  ],
  "사용자 규격 적용": [
    "Apply custom specifications",
    "Áp dụng quy cách tùy chỉnh"
  ],
  "현재 선택:": [
    "Current selection:",
    "Lựa chọn hiện tại:"
  ],
  "제조사 제원": [
    "Manufacturer specifications",
    "Thông số nhà sản xuất"
  ],
  "실제 장비 제원은 제조사·연식·국가별 허용중량에 따라 달라질 수 있으므로 출하 전 실제 장비 데이터를 확인하세요.": [
    "Actual specifications vary by manufacturer, year and national payload limits. Verify actual equipment data before shipment.",
    "Thông số thực tế khác nhau theo nhà sản xuất, năm và giới hạn tải của từng quốc gia. Kiểm tra dữ liệu phương tiện thực tế trước khi xuất hàng."
  ],
  "규격으로 변경됨": [
    "specifications selected",
    "đã chọn quy cách"
  ],
  "기존 적재 배치는 새 적재공간 기준으로 재검증되지 않았습니다. 물리 최적 자동 적재를 다시 실행하세요.": [
    "The current layout has not been revalidated for the new loading space. Rerun physical auto-loading.",
    "Bố trí hiện tại chưa được kiểm tra lại theo khoang mới. Chạy lại tự xếp tối ưu vật lý."
  ],
  "장비 변경 안내 닫기": [
    "Dismiss equipment change notice",
    "Đóng thông báo đổi phương tiện"
  ],
  "장비 변경": [
    "Change equipment",
    "Đổi phương tiện"
  ],
  "{0} 계획을 불러왔습니다.": [
    "Loaded plan {0}.",
    "Đã tải kế hoạch {0}."
  ],
  "저장된 계획": [
    "Saved plans",
    "Kế hoạch đã lưu"
  ],
  "{0} 계획 불러오기": [
    "Load plan {0}",
    "Tải kế hoạch {0}"
  ],
  "종 /": [
    "types /",
    "loại /"
  ],
  "EA · 박스": [
    "EA · Cartons",
    "EA · Thùng"
  ],
  "불러오기": [
    "Load",
    "Tải"
  ],
  "저장된 계획이 없습니다.": [
    "No saved plans.",
    "Không có kế hoạch đã lưu."
  ],
  "컨테이너 안쪽부터 현재 적재 끝점까지를 제외한 문쪽 잔여 길이": [
    "Remaining door-side length after the current load, measured from the inner end",
    "Chiều dài còn lại phía cửa sau phần hàng hiện tại, đo từ đầu trong"
  ],
  "남은": [
    "Remaining",
    "Còn lại"
  ],
  "미리보기 방향 및 분석 제어": [
    "Preview direction and analysis controls",
    "Điều khiển hướng xem và phân tích"
  ],
  "후면": [
    "Rear",
    "Phía sau"
  ],
  "옆면": [
    "Side",
    "Bên hông"
  ],
  "박스정보": [
    "Carton details",
    "Thông tin thùng"
  ],
  "처음 시작합니다.": [
    "Starting fresh.",
    "Bắt đầu mới."
  ],
  "등록된 화물이 없습니다.": [
    "No registered cargo.",
    "Chưa đăng ký hàng hóa."
  ],
  "박스 선택을 눌러 등록된 박스 목록에서 적재할 화물을 고르세요.": [
    "Choose Select cartons to pick cargo from the registered carton list.",
    "Chọn Chọn thùng để lấy hàng từ danh sách thùng đã đăng ký."
  ],
  "박스 선택": [
    "Select cartons",
    "Chọn thùng"
  ],
  "샘플 복원": [
    "Restore samples",
    "Khôi phục mẫu"
  ],
  "브라우저 팝업이 차단되어 작업지시서를 열지 못했습니다. 팝업을 허용한 뒤 다시 실행하세요.": [
    "The work order could not open because browser pop-ups are blocked. Allow pop-ups and try again.",
    "Không mở được lệnh công việc vì trình duyệt chặn cửa sổ bật lên. Cho phép cửa sổ bật lên rồi thử lại."
  ],
  "<body><div class=\"report-advisory\">검토용 작업지시서 · {0}</div>": [
    "<body><div class=\"report-advisory\">Review-only work order · {0}</div>",
    "<body><div class=\"report-advisory\">Lệnh công việc chỉ để xem xét · {0}</div>"
  ],
  "현재 적재안은 작업지시서 생성에 필요한 물리 배치 조건은 충족합니다.\n\n{0}\n\n검증 경고를 포함한 '검토용 작업지시서'를 생성할까요?": [
    "The current plan meets the physical layout requirements for generating a work order.\n\n{0}\n\nGenerate a review-only work order including verification warnings?",
    "Phương án hiện tại đáp ứng yêu cầu bố trí vật lý để tạo lệnh công việc.\n\n{0}\n\nTạo lệnh công việc chỉ để xem xét, kèm cảnh báo kiểm tra?"
  ],
  "관성 3종 검증이 미완료이거나 현재 적재안과 일치하지 않습니다. 출고 전 현장 확인이 필요합니다.": [
    "The three inertia checks are incomplete or do not match the current plan. On-site checks are required before shipment.",
    "Ba kiểm tra quán tính chưa hoàn tất hoặc không khớp phương án hiện tại. Cần kiểm tra tại hiện trường trước khi xuất hàng."
  ],
  "관성 시뮬레이션에서 위험 기준을 초과했습니다. 문서는 검토용으로만 사용하고 재배치·고정 보강 후 출고 여부를 결정하세요.": [
    "The inertia simulation exceeded danger thresholds. Use this document for review only and decide shipment after rearranging and reinforcing restraints.",
    "Mô phỏng quán tính vượt ngưỡng nguy hiểm. Chỉ dùng tài liệu để xem xét và quyết định xuất hàng sau khi sắp xếp lại, gia cố chằng buộc."
  ],
  "관성 내부 PASS 기준을 일부 초과했습니다. 작업지시서의 보완 권장사항과 현장 고정을 확인하세요.": [
    "Some internal inertia PASS thresholds were exceeded. Check the work order recommendations and on-site restraints.",
    "Một số ngưỡng PASS quán tính nội bộ bị vượt. Kiểm tra đề xuất trong lệnh công việc và chằng buộc tại hiện trường."
  ],
  "관성 검증이 완전히 끝나지 않았습니다. 출고 전 현장 확인이 필요합니다.": [
    "Inertia verification is not fully complete. On-site checks are required before shipment.",
    "Kiểm tra quán tính chưa hoàn tất. Cần kiểm tra tại hiện trường trước khi xuất hàng."
  ],
  "작업지시서 생성 차단 · 실제 적재가 불가능한 항목이 있습니다.\n\n{0}": [
    "Work order blocked · Some items cannot be physically loaded.\n\n{0}",
    "Chặn lệnh công việc · Một số mục không thể xếp thực tế.\n\n{0}"
  ],
  "팔레트 작업지시서를 만들 적재 결과가 없습니다. 팔레트 자동 적재를 먼저 실행하세요.": [
    "No pallet loading result for a work order. Run pallet auto-loading first.",
    "Không có kết quả xếp pallet để tạo lệnh công việc. Chạy xếp pallet tự động trước."
  ],
  "작업지시서 생성 차단 · 실제 팔레트 적재가 불가능한 항목이 있습니다.\n\n{0}": [
    "Work order blocked · Some pallet items cannot be physically loaded.\n\n{0}",
    "Chặn lệnh công việc · Một số mục pallet không thể xếp thực tế.\n\n{0}"
  ],
  "작업지시서 생성 차단 · 기본 고정 보조자재 중량까지 포함하면 컨테이너 최대 적재중량을 초과합니다.": [
    "Work order blocked · Including basic securing materials exceeds the container payload limit.",
    "Chặn lệnh công việc · Khi tính cả vật liệu chằng buộc cơ bản, tải hàng vượt giới hạn container."
  ],
  "관성 내부 PASS 기준을 일부 초과했습니다. 작업지시서의 고정 보완사항을 현장에서 확인하세요.": [
    "Some internal inertia PASS thresholds were exceeded. Check work-order restraint improvements on site.",
    "Một số ngưỡng PASS quán tính nội bộ bị vượt. Kiểm tra bổ sung chằng buộc trong lệnh công việc tại hiện trường."
  ],
  "관성 시뮬레이션에서 위험 기준을 초과했습니다. 문서는 검토용으로만 사용하고 팔레트 재배치·밴딩·랩핑·고정 보강 후 출고 여부를 결정하세요.": [
    "The inertia simulation exceeded danger thresholds. Use this document for review only and decide shipment after pallet rearrangement, banding, wrapping and restraint reinforcement.",
    "Mô phỏng quán tính vượt ngưỡng nguy hiểm. Chỉ dùng tài liệu để xem xét và quyết định xuất hàng sau khi sắp xếp pallet, đai, quấn màng và gia cố chằng buộc."
  ],
  "관성 3종 검증이 미완료이거나 현재 팔레트 적재안과 일치하지 않습니다. 출고 전 현장 확인이 필요합니다.": [
    "The three inertia checks are incomplete or do not match the current pallet plan. On-site checks are required before shipment.",
    "Ba kiểm tra quán tính chưa hoàn tất hoặc không khớp phương án pallet hiện tại. Cần kiểm tra tại hiện trường trước khi xuất hàng."
  ],
  "작업지시서": [
    "Work order",
    "Lệnh công việc"
  ],
  "작업 지시서": [
    "Work order",
    "Lệnh công việc"
  ],
  "작업지시서를 만들 적재 결과가 없습니다. 자동 적재를 먼저 실행하세요.": [
    "No loading result for a work order. Run automatic loading first.",
    "Không có kết quả xếp hàng để tạo lệnh công việc. Chạy xếp tự động trước."
  ],
  "테스트 도구": [
    "Test tools",
    "Công cụ kiểm tra"
  ],
  "물리 안정성 종합검증": [
    "Comprehensive physical stability verification",
    "Kiểm tra toàn diện ổn định vật lý"
  ],
  "적재 품목 검색": [
    "Search loaded items",
    "Tìm mặt hàng đã xếp"
  ],
  "품목 코드/품명 검색": [
    "Search item code/name",
    "Tìm mã/tên mặt hàng"
  ],
  "품목 코드 또는 품명 검색": [
    "Search by item code or name",
    "Tìm theo mã hoặc tên mặt hàng"
  ],
  "전체 보기": [
    "Show all",
    "Hiển thị tất cả"
  ],
  "일치하는 품목이 없습니다.": [
    "No matching items.",
    "Không có mặt hàng phù hợp."
  ],
  "3D에서 이 품목만 표시 중": [
    "Showing only this item in 3D",
    "Chỉ hiển thị mặt hàng này trong 3D"
  ],
  "관성 통과": [
    "Inertia passed",
    "Quán tính đạt"
  ],
  "결과 확인 탭": [
    "Results tabs",
    "Thẻ kết quả"
  ],
  "표시할 최종 적재 결과가 없습니다.": [
    "No final loading result to display.",
    "Không có kết quả xếp hàng cuối cùng để hiển thị."
  ],
  "미적재 화물이 없습니다. 등록된 적재 대상이 모두 배치되었습니다.": [
    "No waiting cargo. All registered load units have been placed.",
    "Không có hàng chờ. Tất cả đơn vị xếp đã đăng ký đều được bố trí."
  ],
  "앞뒤 무게중심 편차": [
    "Longitudinal center-of-gravity offset",
    "Độ lệch trọng tâm trước/sau"
  ],
  "적재공간 중심 기준": [
    "Relative to loading-space center",
    "So với tâm khoang hàng"
  ],
  "좌우 무게중심 편차": [
    "Lateral center-of-gravity offset",
    "Độ lệch trọng tâm trái/phải"
  ],
  "무게중심 높이": [
    "Center-of-gravity height",
    "Chiều cao trọng tâm"
  ],
  "내부 높이 대비": [
    "Relative to internal height",
    "So với chiều cao trong"
  ],
  "최대 바닥하중": [
    "Maximum floor load",
    "Tải sàn tối đa"
  ],
  "기준": [
    "Limit",
    "Giới hạn"
  ],
  "적재 품질": [
    "Loading quality",
    "Chất lượng xếp hàng"
  ],
  "점": [
    "points",
    "điểm"
  ],
  "무게중심 + 형상 평가": [
    "Center of gravity + shape assessment",
    "Đánh giá trọng tâm + hình dạng"
  ],
  "무게 분포를 계산할 적재 결과가 없습니다.": [
    "No loading result for weight distribution calculations.",
    "Không có kết quả xếp hàng để tính phân bố khối lượng."
  ],
  "관성 3종 검사": [
    "Three inertia checks",
    "Ba kiểm tra quán tính"
  ],
  "검사 {0}/3 · 최대 이동 {1} mm": [
    "Check {0}/3 · Maximum movement {1} mm",
    "Kiểm tra {0}/3 · Dịch chuyển tối đa {1} mm"
  ],
  "현재 적재 유형의 관성 검사 결과를 확인하세요.": [
    "Review inertia results for the current loading type.",
    "Xem kết quả quán tính cho loại xếp hàng hiện tại."
  ],
  "안전 검사를 표시할 적재 결과가 없습니다.": [
    "No loading result for safety checks.",
    "Không có kết quả xếp hàng để kiểm tra an toàn."
  ],
  "현재 작업의 점검 ZIP 파일을 PC에 다운로드합니다.": [
    "Download a diagnostic ZIP for the current work to your computer.",
    "Tải ZIP chẩn đoán cho công việc hiện tại về máy tính."
  ],
  "점검 파일 준비 중…": [
    "Preparing diagnostic file…",
    "Đang chuẩn bị tệp chẩn đoán…"
  ],
  "알 수 없는 화면 오류가 발생했습니다.": [
    "An unknown display error occurred.",
    "Đã xảy ra lỗi hiển thị không xác định."
  ],
  "화면을 정상적으로 표시하지 못했습니다.": [
    "The screen could not be displayed correctly.",
    "Không thể hiển thị màn hình đúng cách."
  ],
  "먼저 새로고침을 시도하고, 계속 문제가 생기면 저장된 브라우저 데이터를 초기화하세요.": [
    "Try refreshing first. If the issue persists, reset saved browser data.",
    "Thử làm mới trước. Nếu vẫn lỗi, đặt lại dữ liệu đã lưu của trình duyệt."
  ],
  "새로고침": [
    "Refresh",
    "Làm mới"
  ],
  "로컬 데이터 초기화": [
    "Reset local data",
    "Đặt lại dữ liệu cục bộ"
  ],
  "승인 박스 코드를 입력하세요.": [
    "Enter the approved carton code.",
    "Nhập mã thùng đã được phê duyệt."
  ],
  "제조 완료 박스의 실제 자중은 0 이상의 유한한 값이어야 합니다.": [
    "The actual tare weight of the finished carton must be finite and at least zero.",
    "Khối lượng bì thực tế của thùng thành phẩm phải là số hữu hạn không âm."
  ],
  "제조사 검증 상부 허용중량은 0 이상의 유한한 값이어야 합니다.": [
    "The manufacturer-verified top-load limit must be finite and at least zero.",
    "Giới hạn tải phía trên do nhà sản xuất xác minh phải là số hữu hạn không âm."
  ],
  "제조사 검증 최대 총중량은 0보다 커야 합니다.": [
    "The manufacturer-verified maximum gross weight must be greater than zero.",
    "Tổng khối lượng tối đa do nhà sản xuất xác minh phải lớn hơn 0."
  ],
  "박스 단가는 비우거나 0 이상의 값이어야 합니다.": [
    "Leave the carton unit cost blank or enter a non-negative value.",
    "Để trống đơn giá thùng hoặc nhập giá trị không âm."
  ],
  "승인할 자동설계 규격이 없습니다.": [
    "There is no automatically designed specification to approve.",
    "Không có quy cách thiết kế tự động để phê duyệt."
  ],
  "이미 보유박스 강도가 적용된 규격이 포함되어 있습니다.": [
    "The selection includes a specification already using registered carton strength.",
    "Lựa chọn có quy cách đã áp dụng độ bền của thùng đã đăng ký."
  ],
  "승인 규격에 연결된 제품 정보를 찾지 못했습니다.": [
    "Product information linked to the approved specification was not found.",
    "Không tìm thấy thông tin sản phẩm liên kết với quy cách được phê duyệt."
  ],
  "검증 최대 총중량이 이 규격을 공유하는 제품 중 가장 무거운 Full 박스 {0}kg보다 작습니다.": [
    "The verified maximum gross weight is below the heaviest full carton ({0} kg) among products sharing this specification.",
    "Tổng khối lượng tối đa đã xác minh thấp hơn thùng đầy nặng nhất ({0} kg) trong các sản phẩm dùng chung quy cách này."
  ],
  "검증 {0}×{1}×{2}mm": [
    "Verified {0}×{1}×{2} mm",
    "Đã xác minh {0}×{1}×{2} mm"
  ],
  "이미 보유박스 강도가 적용된 규격입니다.": [
    "This specification already uses registered carton strength.",
    "Quy cách này đã áp dụng độ bền của thùng đã đăng ký."
  ],
  "공용 자동규격 {0}×{1}×{2}mm": [
    "Shared automatic specification {0}×{1}×{2} mm",
    "Quy cách tự động dùng chung {0}×{1}×{2} mm"
  ],
  "{0} · {1} · 잔량 {2}EA": [
    "{0} · {1} · Remaining {2} EA",
    "{0} · {1} · Còn lại {2} EA"
  ],
  "혼합 잔량 · {0}": [
    "Mixed remainder · {0}",
    "Phần dư hỗn hợp · {0}"
  ],
  "제품 코드가 비어 있습니다.": [
    "The product code is empty.",
    "Mã sản phẩm đang trống."
  ],
  "제품명이 비어 있습니다.": [
    "The product name is empty.",
    "Tên sản phẩm đang trống."
  ],
  "박스당 최대 수량은 1 이상의 정수여야 합니다.": [
    "The maximum quantity per carton must be an integer of at least 1.",
    "Số lượng tối đa mỗi thùng phải là số nguyên ít nhất bằng 1."
  ],
  "완충 여유는 0 이상의 값이어야 합니다.": [
    "Cushioning clearance must be non-negative.",
    "Khoảng chừa đệm phải không âm."
  ],
  "제품 간격은 0 이상의 값이어야 합니다.": [
    "Product spacing must be non-negative.",
    "Khoảng cách giữa các sản phẩm phải không âm."
  ],
  "박스 내부 최대 적층은 1 이상의 정수여야 합니다.": [
    "The maximum number of layers inside a carton must be an integer of at least 1.",
    "Số lớp tối đa bên trong thùng phải là số nguyên ít nhất bằng 1."
  ],
  "제품 회전 정책을 확인하세요.": [
    "Check the product rotation policy.",
    "Kiểm tra quy tắc xoay sản phẩm."
  ],
  "박스 코드/이름이 비어 있습니다.": [
    "The carton code or name is empty.",
    "Mã hoặc tên thùng đang trống."
  ],
  "박스 내외부 치수는 0보다 커야 합니다.": [
    "Internal and external carton dimensions must be greater than zero.",
    "Kích thước trong và ngoài của thùng phải lớn hơn 0."
  ],
  "박스 자중/최대 총중량을 확인하세요.": [
    "Check the carton tare weight and maximum gross weight.",
    "Kiểm tra khối lượng bì và tổng khối lượng tối đa của thùng."
  ],
  "상부 허용중량은 0 이상이어야 합니다.": [
    "The top-load limit must be non-negative.",
    "Giới hạn tải phía trên phải không âm."
  ],
  "박스 단가는 0 이상이어야 합니다.": [
    "The carton unit cost must be non-negative.",
    "Đơn giá thùng phải không âm."
  ],
  "자동설계 {0}×{1}×{2}mm": [
    "Automatic design {0}×{1}×{2} mm",
    "Thiết kế tự động {0}×{1}×{2} mm"
  ],
  "(미입력)": [
    "(Not entered)",
    "(Chưa nhập)"
  ],
  "등록 박스와 자동설계 후보 중 제품을 안전하게 담을 수 있는 규격이 없습니다.": [
    "No registered carton or automatic design candidate can safely contain this product.",
    "Không có thùng đã đăng ký hoặc phương án thiết kế tự động nào có thể chứa sản phẩm này an toàn."
  ]
};
