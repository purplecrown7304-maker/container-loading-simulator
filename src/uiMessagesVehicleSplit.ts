/** Presentation copy of the vehicle split (AGENTS.md 2L). Cargo ids, quantities and engine reasons stay as they are. */
export const uiMessagesVehicleSplit: Readonly<Record<string, readonly [string, string]>> = {
  '차량 나누기': ['Vehicle split', 'Chia xe'],
  '한 대에 다 싣지 못했습니다': ['One vehicle cannot carry everything', 'Một xe không chở hết được'],
  '이 적재는 운송 검증을 통과하지 못했습니다': ['This load did not pass transport verification', 'Phương án xếp này không đạt kiểm chứng vận chuyển'],
  '미적재 {0} EA가 남았습니다. 차량 {1}대로 나누면 품목마다 고르게 나눠 차량별로 다시 계산하고 검증합니다.': [
    '{0} EA are left waiting. Dividing over {1} vehicles shares every item evenly, then plans and verifies each vehicle again.',
    'Còn {0} EA chưa xếp. Chia cho {1} xe sẽ chia đều từng mặt hàng, rồi tính và kiểm chứng lại từng xe.',
  ],
  '차량 {0}대로 나누면 품목마다 고르게 나눠 더 낮게 싣고 차량별로 다시 계산하고 검증합니다.': [
    'Dividing over {0} vehicles shares every item evenly, stacks lower, then plans and verifies each vehicle again.',
    'Chia cho {0} xe sẽ chia đều từng mặt hàng, xếp thấp hơn, rồi tính và kiểm chứng lại từng xe.',
  ],
  '차량 {0}대로 나누기': ['Divide over {0} vehicles', 'Chia cho {0} xe'],
  '차량 {0}대로 다시 나누기': ['Divide again over {0} vehicles', 'Chia lại cho {0} xe'],
  '한 대로 되돌리기': ['Back to one vehicle', 'Trở lại một xe'],
  '차량 {0} / {1}': ['Vehicle {0} / {1}', 'Xe {0} / {1}'],
  '차량 {0}/{1}': ['Vehicle {0}/{1}', 'Xe {0}/{1}'],
  '차량 {0}': ['Vehicle {0}', 'Xe {0}'],
  '품목마다 고르게 나눈 화물': ['Every item shared evenly', 'Mỗi mặt hàng được chia đều'],
  '차량 선택': ['Choose vehicle', 'Chọn xe'],
  '검증 통과 기록': ['Passed (earlier record)', 'Đã đạt (ghi nhận trước)'],
  '검증 실패 기록': ['Failed (earlier record)', 'Không đạt (ghi nhận trước)'],
  'WHAT-IF 검토 기록': ['WHAT-IF review (earlier record)', 'Xem xét WHAT-IF (ghi nhận trước)'],
  '차량을 바꾸면 그 차량의 화물로 다시 계산하고 검증합니다. 작업지시서는 차량마다 따로 출력하세요.': [
    'Choosing a vehicle plans and verifies its cargo again. Print a work order for each vehicle.',
    'Khi đổi xe, hàng của xe đó được tính và kiểm chứng lại. Hãy in phiếu công việc riêng cho từng xe.',
  ],
  '화물 목록이 바뀌어 차량 나누기를 풀었습니다. 지금 화물은 전체 출하 화물이 아닐 수 있습니다. 전체 화물로 계산하려면 제품 포장을 다시 확정하세요.': [
    'The cargo list changed, so the vehicle split was ended. The current cargo may not be the whole shipment. Confirm the product packaging again to plan the whole cargo.',
    'Danh sách hàng đã thay đổi nên việc chia xe đã kết thúc. Hàng hiện tại có thể không phải toàn bộ lô hàng. Hãy xác nhận lại bao gói sản phẩm để tính toàn bộ hàng.',
  ],
  '차량 나누기를 적용했습니다. 표시된 차량의 화물로 ‘최종 적재 진행’을 누르세요.': [
    'Vehicle split applied. Press “Run final loading” for the cargo of the vehicle shown.',
    'Đã áp dụng chia xe. Hãy nhấn “Chạy xếp hàng cuối cùng” cho hàng của xe đang hiển thị.',
  ],
  '차량 나누기를 풀고 전체 화물로 되돌렸습니다.': ['Vehicle split ended; the whole cargo is back in one vehicle.', 'Đã kết thúc chia xe; toàn bộ hàng trở lại một xe.'],
  '차량별로 나눈 화물입니다. 이 표는 이 차량에 싣는 수량입니다. 제품 전체 출하수량은 모든 차량의 문서를 합쳐 대조하세요.': [
    'This cargo is divided over several vehicles. The table lists what this vehicle carries. Check the whole shipment quantity against the documents of all vehicles together.',
    'Hàng này được chia cho nhiều xe. Bảng này là số lượng xếp lên xe này. Hãy đối chiếu tổng số lượng xuất hàng bằng chứng từ của tất cả các xe.',
  ],
  '이 차량은 앞 차량과 화물이 같습니다. 같은 적재안과 검증 결과를 그대로 씁니다.': [
    'This vehicle carries the same cargo as the previous one. The same plan and verification result apply.',
    'Xe này chở cùng loại hàng như xe trước. Dùng lại phương án xếp và kết quả kiểm chứng đó.',
  ],
  '차량별 화물 기준': ['By vehicle cargo', 'Theo hàng của từng xe'],
  '이 문서': ['this document', 'chứng từ này'],
  '{0} · 나눠 싣는 화물': ['{0} · divided cargo', '{0} · hàng chia xe'],
  '전체 {0} EA를 차량 {1}대에 고르게 나눈 화물입니다. 이 문서는 차량 {2}의 화물만 다룹니다. 다른 차량은 그 차량의 문서로 작업하세요.': [
    'All {0} EA are divided evenly over {1} vehicles. This document covers the cargo of vehicle {2} only. Work on the other vehicles from their own documents.',
    'Toàn bộ {0} EA được chia đều cho {1} xe. Chứng từ này chỉ gồm hàng của xe {2}. Các xe khác làm theo chứng từ của xe đó.',
  ],
  '차량 구분': ['Vehicle', 'Xe'],
  '전체 출하 수량(EA, 모든 차량)': ['Whole shipment (EA, all vehicles)', 'Toàn bộ lô hàng (EA, tất cả xe)'],
};
