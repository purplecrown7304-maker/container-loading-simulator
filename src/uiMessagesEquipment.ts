/** Built-in equipment labels only; custom names/notes are not translated. */
export const uiMessagesEquipment: Record<string, readonly [string, string]> = {
  "Hapag-Lloyd / Maersk 대표 장비값": [
    "Representative Hapag-Lloyd / Maersk specifications",
    "Thông số tiêu biểu Hapag-Lloyd / Maersk"
  ],
  "DSV / 국제 도로운송 대표 장비값": [
    "Representative DSV / international road-transport specifications",
    "Thông số tiêu biểu DSV / vận tải đường bộ quốc tế"
  ],
  "천장 개방형. 기본 계산은 등록된 내부 높이를 안전 한계로 사용합니다.": [
    "Open top. Default calculations use the registered internal height as the safety limit.",
    "Mở nóc. Tính mặc định dùng chiều cao trong đã đăng ký làm giới hạn an toàn."
  ],
  "천장 개방형. OOG 초과높이는 실제 운송조건 확인 후 사용자 규격으로 조정하세요.": [
    "Open top. For OOG height, verify actual transport conditions before adjusting custom specifications.",
    "Mở nóc. Với chiều cao OOG, kiểm tra điều kiện vận chuyển thực tế trước khi chỉnh quy cách tùy chỉnh."
  ],
  "측면/상부 개방. 시뮬레이터는 안전상 입력 폭·높이를 기본 적재 한계로 사용합니다.": [
    "Open sides/top. For safety, the simulator uses the entered width/height as default loading limits.",
    "Mở bên/nóc. Để an toàn, mô phỏng dùng chiều rộng/cao đã nhập làm giới hạn xếp mặc định."
  ],
  "측면/상부 개방. OOG 화물은 실제 승인치수로 사용자 규격을 입력하세요.": [
    "Open sides/top. Enter approved actual dimensions for OOG cargo as custom specifications.",
    "Mở bên/nóc. Nhập kích thước thực đã được chấp thuận cho hàng OOG vào quy cách tùy chỉnh."
  ],
  "접이식 엔드월. 적재 높이는 보수적 작업 한계값이며 실제 장비 승인값으로 수정 가능합니다.": [
    "Folding end walls. The loading height is a conservative operating limit and can be changed to an approved equipment value.",
    "Vách đầu gập. Chiều cao xếp là giới hạn làm việc bảo thủ, có thể đổi thành giá trị phương tiện đã được chấp thuận."
  ],
  "벽/천장 없음. 입력 높이는 시뮬레이션 작업 한계입니다.": [
    "No walls/ceiling. Entered height is the simulation operating limit.",
    "Không có vách/nóc. Chiều cao đã nhập là giới hạn làm việc trong mô phỏng."
  ],
  "ISO 20FT 대표 외형값": [
    "Representative ISO 20FT outer dimensions",
    "Kích thước ngoài ISO 20FT tiêu biểu"
  ],
  "벌크 전용 장비입니다. 박스 적재 결과는 참고용으로만 사용하세요.": [
    "Bulk-only equipment. Use carton loading results for reference only.",
    "Phương tiện chỉ dành cho hàng rời. Kết quả xếp thùng chỉ để tham khảo."
  ],
  "ISO 20FT 탱크 프레임 대표값": [
    "Representative ISO 20FT tank frame",
    "Khung bồn ISO 20FT tiêu biểu"
  ],
  "액체/가스 탱크 전용 장비로 박스 적재 대상이 아닙니다.": [
    "Liquid/gas tank equipment; not suitable for carton loading.",
    "Bồn dành cho chất lỏng/khí; không phù hợp xếp thùng."
  ],
  "사용자 입력값": [
    "User-entered values",
    "Giá trị do người dùng nhập"
  ],
  "측면 커튼 개방 적재 가능. 제조사·국가 규정에 따라 제원이 달라질 수 있습니다.": [
    "Loading through open side curtains is possible. Specifications vary by manufacturer and national regulations.",
    "Có thể xếp qua rèm bên mở. Thông số khác nhau theo nhà sản xuất và quy định quốc gia."
  ],
  "냉장 트레일러 대표 내측치수 기반": [
    "Based on representative refrigerated-trailer internal dimensions",
    "Dựa trên kích thước trong sơ mi rơ moóc lạnh tiêu biểu"
  ],
  "단열차량 대표값입니다. 실제 차량 등록증/제조사 제원으로 수정하세요.": [
    "Representative insulated vehicle. Update using the actual registration or manufacturer specifications.",
    "Xe cách nhiệt tiêu biểu. Cập nhật theo đăng ký thực hoặc thông số nhà sản xuất."
  ],
  "유럽 Jumbo 120m³ 대표값": [
    "Representative European Jumbo 120 m³",
    "Jumbo châu Âu 120 m³ tiêu biểu"
  ],
  "7.7m + 7.7m 조합형 대표 적재공간을 하나의 연속 공간으로 근사합니다.": [
    "Approximates a 7.7 m + 7.7 m combined load space as one continuous space.",
    "Xấp xỉ khoang kết hợp 7,7 m + 7,7 m thành một khoang liên tục."
  ],
  "실차 내부 치수·적재중량·바닥하중을 입력하세요.": [
    "Enter actual internal dimensions, payload and floor load.",
    "Nhập kích thước trong, tải hàng và tải sàn thực tế."
  ],
  "바닥하중은 적재중량÷바닥면적을 10kg/m² 단위로 올린 임시 유도값입니다. 실제 바닥 강도·국부 하중과 등록증은 실차 값으로 확인·편집하세요.": [
    "Floor load is a provisional value derived from payload ÷ floor area, rounded up to 10 kg/m² increments. Verify/edit actual floor strength, local loads and registration values for the vehicle.",
    "Tải sàn là giá trị tạm tính từ tải hàng ÷ diện tích sàn, làm tròn lên theo bước 10 kg/m². Kiểm tra/chỉnh độ bền sàn, tải cục bộ và giá trị đăng ký thực tế của xe."
  ],
  "제조사 대표 완성 특장 사양. 내부 치수와 화물 적재중량이며 차량 전체 치수·총중량이 아닙니다.": [
    "Representative manufacturer-built body. Dimensions are internal cargo dimensions and weights are cargo payload, not overall vehicle dimensions or gross vehicle weight.",
    "Thùng xe hoàn thiện tiêu biểu của nhà sản xuất. Kích thước là trong khoang và khối lượng là tải hàng, không phải kích thước toàn xe hay tổng khối lượng xe."
  ],
  "1톤 내장탑차": [
    "1-ton box truck",
    "Xe thùng kín 1 tấn"
  ],
  "1톤 내장탑": [
    "1-ton box body",
    "Thùng kín 1 tấn"
  ],
  "현대 포터 II 특장 · 슈퍼캡 내장탑": [
    "Hyundai Porter II Special · Super Cab box body",
    "Hyundai Porter II chuyên dụng · Thùng kín Super Cab"
  ],
  "2.5톤 윙바디": [
    "2.5-ton wing body",
    "Thùng cánh mở 2,5 tấn"
  ],
  "현대 마이티 특장 · 8톤 GVW 장축 고상 윙바디": [
    "Hyundai Mighty Special · 8-ton GVW long-wheelbase high-deck wing body",
    "Hyundai Mighty chuyên dụng · Thùng cánh mở sàn cao trục dài, GVW 8 tấn"
  ],
  "2.5톤급 내장탑 (허용 2.4톤)": [
    "2.5-ton-class box body (2.4-ton payload)",
    "Thùng kín hạng 2,5 tấn (tải 2,4 tấn)"
  ],
  "2.4톤 내장탑": [
    "2.4-ton box body",
    "Thùng kín 2,4 tấn"
  ],
  "현대 마이티 특장 · 7.5톤 GVW 장축 고상 내장탑": [
    "Hyundai Mighty Special · 7.5-ton GVW long-wheelbase high-deck box body",
    "Hyundai Mighty chuyên dụng · Thùng kín sàn cao trục dài, GVW 7,5 tấn"
  ],
  "5톤급 윙바디 (허용 5.5톤)": [
    "5-ton-class wing body (5.5-ton payload)",
    "Thùng cánh mở hạng 5 tấn (tải 5,5 tấn)"
  ],
  "5.5톤 윙바디": [
    "5.5-ton wing body",
    "Thùng cánh mở 5,5 tấn"
  ],
  "현대 파비스 · 초장축플러스 7.0 윙바디": [
    "Hyundai Pavise · Extra-long Plus 7.0 wing body",
    "Hyundai Pavise · Thùng cánh mở Extra-long Plus 7.0"
  ],
  "7톤 후2축 윙바디": [
    "7-ton tandem-rear-axle wing body",
    "Thùng cánh mở 7 tấn hai trục sau"
  ],
  "현대 파비스 · 8.3 경량화 윙바디 후2축": [
    "Hyundai Pavise · Lightweight 8.3 wing body, tandem rear axles",
    "Hyundai Pavise · Thùng cánh mở nhẹ 8.3, hai trục sau"
  ],
  "대형 윙바디 · 실차 등록": [
    "Heavy wing body · Register actual vehicle",
    "Thùng cánh mở lớn · Đăng ký xe thực"
  ],
  "대형 실차 등록": [
    "Register heavy vehicle",
    "Đăng ký xe tải lớn"
  ],
  "엑시언트 Fuel Cell 내측 참고 · 허용중량 미확인": [
    "Xcient Fuel Cell internal reference · Payload unverified",
    "Tham khảo khoang Xcient Fuel Cell · Chưa xác minh tải hàng"
  ],
  "11·14·25톤 특장차는 차체에 따라 다릅니다. 실차 내측 치수, 등록증 적재중량과 바닥하중을 입력한 뒤 적용하세요. 참고 치수는 10.02×2.40×2.48m이며 총중량 28톤을 적재중량으로 사용하지 않습니다.": [
    "11/14/25-ton specialty vehicles vary by body. Enter actual internal dimensions, registered payload and floor load before applying. Reference dimensions are 10.02×2.40×2.48 m; 28-ton gross vehicle weight is not used as payload.",
    "Xe chuyên dụng 11/14/25 tấn thay đổi theo thân xe. Nhập kích thước trong, tải hàng đăng ký và tải sàn thực trước khi áp dụng. Kích thước tham khảo 10.02×2.40×2.48 m; không dùng tổng khối lượng xe 28 tấn làm tải hàng."
  ],
  "사용자 트럭 · 실차 규격": [
    "Custom truck · Actual vehicle specifications",
    "Xe tải tùy chỉnh · Thông số xe thực"
  ],
  "초기 입력은 1톤 내장탑 참고값입니다. 실차 제원으로 수정하세요.": [
    "Initial entries reference a 1-ton box body. Update to actual vehicle specifications.",
    "Giá trị ban đầu tham khảo thùng kín 1 tấn. Cập nhật theo thông số xe thực."
  ],
  "제조사 대표 완성 특장 사양. 내부 치수와 화물 적재중량이며 차량 전체 치수·총중량이 아닙니다. 바닥하중은 적재중량÷바닥면적을 10kg/m² 단위로 올린 임시 유도값입니다. 실제 바닥 강도·국부 하중과 등록증은 실차 값으로 확인·편집하세요.": [
    "Representative manufacturer-built body. Dimensions are internal cargo dimensions and weights are cargo payload, not overall vehicle dimensions or gross vehicle weight. Floor load is a provisional value derived from payload ÷ floor area, rounded up to 10 kg/m² increments. Verify/edit actual floor strength, local loads and registration values for the vehicle.",
    "Thùng xe hoàn thiện tiêu biểu của nhà sản xuất. Kích thước là trong khoang và khối lượng là tải hàng, không phải kích thước toàn xe hay tổng khối lượng xe. Tải sàn là giá trị tạm tính từ tải hàng ÷ diện tích sàn, làm tròn lên theo bước 10 kg/m². Kiểm tra/chỉnh độ bền sàn, tải cục bộ và giá trị đăng ký thực tế của xe."
  ],
  "초기 입력은 1톤 내장탑 참고값입니다. 실차 제원으로 수정하세요. 바닥하중은 적재중량÷바닥면적을 10kg/m² 단위로 올린 임시 유도값입니다. 실제 바닥 강도·국부 하중과 등록증은 실차 값으로 확인·편집하세요.": [
    "Initial entries reference a 1-ton box body. Update to actual vehicle specifications. Floor load is a provisional value derived from payload ÷ floor area, rounded up to 10 kg/m² increments. Verify/edit actual floor strength, local loads and registration values for the vehicle.",
    "Giá trị ban đầu tham khảo thùng kín 1 tấn. Cập nhật theo thông số xe thực. Tải sàn là giá trị tạm tính từ tải hàng ÷ diện tích sàn, làm tròn lên theo bước 10 kg/m². Kiểm tra/chỉnh độ bền sàn, tải cục bộ và giá trị đăng ký thực tế của xe."
  ]
};
