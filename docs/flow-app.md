# Luồng ứng dụng Tiki Money

Tiki Money là sổ thu chi nói bằng tiếng Việt. Người dùng gõ một câu, nói vào micro, hoặc bấm nút ghi nhanh. App đề xuất khoản rồi **chỉ ghi sổ sau khi xác nhận**. Câu hỏi về số đã chi được tính từ SQLite trên máy, không lấy chữ số do mô hình trả về.

Sổ nằm trong một file `so-chi-tieu.db` trên thiết bị. Đăng nhập Gmail chỉ giữ phiên, không đồng bộ khoản lên cloud và không tách sổ theo tài khoản. Chi tiết bảng và transaction nằm ở [kien-truc.md](./kien-truc.md).

Ngày trên sổ luôn theo `Asia/Ho_Chi_Minh`, kể cả khi máy để múi giờ khác.

![Bản đồ luồng: ba cách nhập, ba ý định, sổ chỉ ghi sau xác nhận](./images/00-ban-do.svg)

## Bản đồ màn hình

| Đường dẫn | Màn | Việc người dùng làm |
| --- | --- | --- |
| `/` | Chuyển hướng | Vào thẳng sổ chat |
| `/so-chi-tieu` | Sổ chat | Ghi, hỏi, sửa, xoá khoản |
| `/danh-muc` | Danh mục | Thêm, ẩn, hiện danh mục |
| `/dang-nhap` | Đăng nhập | Gắn Gmail, hoặc bỏ qua |

Mở app không chặn bằng đăng nhập. `/` luôn đẩy sang `/so-chi-tieu`. Màn Gmail chỉ mở khi người dùng bấm **Gắn Gmail** trong menu. Nếu đã có phiên, `/dang-nhap` đẩy ngược về sổ.

## 1. Mở app

1. Splash giữ màn hình đến khi font Inter và Lora tải xong.
2. App bọc giao diện (sáng, tối, hoặc theo máy), phiên đăng nhập, và danh mục trong bộ nhớ.
3. Sổ SQLite mở một lần. Lần đầu tạo bốn bảng `tx`, `msg`, `category`, `chip`, rồi seed 18 danh mục và bốn nút ghi nhanh nếu bảng chip đang trống.
4. Sổ chat tải toàn bộ hội thoại và tổng trên thanh đảo.

## 2. Sổ chat

Đây là màn làm việc duy nhất hàng ngày.

![Sổ trống: thanh đảo, chỗ trống, nút ghi nhanh và ô soạn](./images/02-so-trong.svg)

Từ trên xuống:

- **Nút menu** góc trái mở ngăn bên.
- **Thanh đảo** màu đen, giữa mép trên, hiện ngày đang xem và tổng chi, thu của ngày đó.
- **Hội thoại** nhóm theo ngày. Mốc đầu ngày viết `Hôm nay, 27/10` hoặc `Thứ hai, 26/10`.
- **Nút ghi nhanh** nằm ngang phía trên ô soạn. Mặc định: Trà sữa 35k, Cơm trưa 55k, Đổ xăng 70k, Gửi xe 5k.
- **Ô soạn** nhận chữ hoặc micro. Khi app đang gọi mô hình, ô khoá không gửi thêm.

Khi chưa có tin, giữa màn hiện **Chưa có khoản nào** và gợi ý `cà phê 30k`.

Cuộn hội thoại đổi ngày trên thanh đảo theo mốc ngày đang lọt vào tầm nhìn. Kéo sát đáy thì đảo neo vào ngày mới nhất.

## 3. Ghi một khoản bằng chữ

Ví dụ người dùng gửi `cà phê 30k`.

![Thẻ chờ xác nhận, đếm ngược 5 giây](./images/03-cho-xac-nhan.svg)

1. Câu được lưu thành tin của người dùng và hiện bong bóng bên phải.
2. App hiện hàng chấm “đang nghĩ”, gửi vài lượt chat gần nhất cùng câu mới cho Gemini.
3. Mô hình trả ý định `record`, một câu trả lời tiếng Việt, và một bản nháp: số tiền, hướng `chi` hoặc `thu`, danh mục, ghi chú, ngày, độ chắc.
4. App tinh chỉnh danh mục theo thói quen trong sổ, rồi hiện câu trả lời và **thẻ khoản**.
5. Thẻ lúc này chưa phải giao dịch. Nhãn là **Chờ xác nhận**. Nếu độ chắc dưới 0,6 thì nhãn đổi thành **Cần kiểm tra**.
6. Nút **Xác nhận** đếm ngược 5 giây rồi tự ghi. Bấm sớm thì ghi ngay. **Chỉnh sửa** dừng đồng hồ.

Cách đọc tiền của mô hình, rồi app lưu số nguyên VND:

| Người nói | Số lưu |
| --- | --- |
| `35k`, `35 nghìn`, `35 ngàn` | 35.000 |
| `1tr`, `1 triệu` | 1.000.000 |
| `45.000` | 45.000 |
| `2 trăm` | 200.000 |
| số trần dưới 1000, ví dụ `150` | hiểu là nghìn, tức 150.000 |

Không có ngày trong câu thì lấy hôm nay. `hôm qua`, `hôm kia`, `thứ hai tuần trước`, `3 ngày trước`, `đầu tháng` được đổi thành ngày `YYYY-MM-DD`.

Hướng `thu` chỉ khi tiền vào: lương, thưởng, được trả, bán hàng. Còn lại là `chi`.

![Sau khi xác nhận: thẻ Đã lưu và thanh đảo cho hoàn tác](./images/04-da-luu.svg)

Xác nhận ghi trong một transaction: tạo dòng `tx`, đổi tin nháp thành biên lai, tăng số lần dùng của danh mục. Thanh đảo nở khoảng 2,8 giây, hiện **Đã lưu vào hôm nay** (hoặc ngày đã chọn) và nút **Hoàn tác**. Hoàn tác xoá dòng vừa ghi và trả thẻ về chờ xác nhận.

Trên thẻ đã lưu có **Chỉnh sửa** (số tiền, danh mục, ngày, ghi chú) và nút xoá. Sửa biên lai cập nhật mọi biên lai cùng khoản.

## 4. Ghi bằng giọng nói

![Ô soạn khi đang ghi âm](./images/09-ghi-am.svg)

1. Bấm micro. Lần đầu app xin quyền. Từ chối thì hiện *Cần quyền micro để ghi giọng nói.*
2. Sóng âm và đồng hồ chạy. Dưới 0,4 giây thì không gửi, kèm *Nói lâu hơn một chút rồi gửi.*
3. Tối đa 60 giây thì tự dừng và gửi.
4. Nút huỷ bỏ đoạn ghi. Nút gửi đẩy file âm thanh cho Gemini.
5. Hội thoại hiện tin `🎙 Đoạn ghi âm 0:04`. Nghe lại được trên chính bong bóng đó.
6. Khi mô hình trả ghi chú của các khoản, chữ đó thay dòng giữ chỗ, nằm dưới trình phát.

Ghi âm không có chữ sẵn, nên nếu là lời sửa khoản cũ, app đối chiếu bằng ghi chú trong bản nháp.

## 5. Nút ghi nhanh

Bấm một chip **không gọi Gemini**. App tự viết ba dòng:

- tin người dùng, đúng nhãn chip, ví dụ `Trà sữa 35k`;
- câu trả lời *Mình ghi Trà sữa 35k. Kiểm tra giúp mình trước khi lưu nhé.*;
- thẻ nháp hướng `chi`, số và danh mục lấy từ chip, ngày là hôm nay, độ chắc bằng 1.

Xác nhận đi cùng đường với khoản gõ bằng chữ. App chỉ đọc chip, chưa có màn sửa danh sách nút này.

## 6. Nhiều khoản trong một câu

`sáng ăn 45k trưa 55k` thành một nhóm, chung một thẻ.

![Thẻ nhóm hai khoản, một nút xác nhận](./images/08-nhieu-khoan.svg)

Thẻ hiện `2 khoản`, tổng chi, từng dòng, và một nút **Xác nhận** cho cả nhóm. Sửa được từng dòng trước khi ghi. Sau khi lưu, thanh đảo báo `Đã lưu 2 khoản`. Hoàn tác trên đảo gỡ cả nhóm.

Thẻ sửa một khoản đã có không bị gộp vào nhóm này.

## 7. Hỏi số đã ghi

Ý định `query` không nhận số tiền từ mô hình. Mô hình chỉ chọn:

- `query.start` và `query.end`, hai ngày inclusive;
- `query.category` khi câu nói đúng một tên danh mục có trong sổ.

Khoảng ngày hỏng thì app lấy từ ngày 01 tháng này đến hôm nay. Danh mục lạ bị bỏ, câu trả lời không lọc theo danh mục.

Ví dụ câu app ghép từ sổ:

- `Hôm nay bạn đã chi 85.000đ, gồm 2 khoản.`
- `Tháng này bạn đã chi 1.200.000đ và thu 12.000.000đ, gồm 18 khoản.`
- `Hôm nay chưa có khoản Đồ uống.`
- `Tháng này chưa có khoản nào.`

Nhãn khoảng ngày gồm Hôm nay, Hôm qua, Hôm kia, Ngày mai, Ngày kia, một ngày, Tuần này, Tuần trước, Tuần sau, Tháng này, Tháng trước, Tháng sau, cả một tháng, hoặc `Từ dd/mm đến dd/mm`. Ngày mai, tuần sau, tháng sau và mọi khoảng chưa có dòng nào thì câu trả lời nói chưa có khoản.

## 8. Ngoài việc ghi và xem sổ

Ý định `off_topic` không tạo thẻ.

- Tin tức, thời tiết, học bài, code, đùa, kiến thức chung: *Mình chỉ giúp bạn ghi và xem thu chi. Bạn nói một khoản nhé, ví dụ cà phê 30k.*
- Xin lời khuyên vay, lãi, đầu tư, bảo hiểm, thuế, giá, có nên trả nợ: *Mình chỉ tính trên số bạn đã ghi thôi.*

App không lưu nợ, mục tiêu tiết kiệm, hay lương tháng. Khối “còn lại tháng này” trên thanh đảo hiện chưa được bật (`forecast` luôn trống). Dòng **Dòng tiền ra** trên đảo đang bằng tổng chi của tháng.

## 9. Sửa một khoản đã lưu bằng câu nói

![Thẻ cập nhật trỏ về khoản gốc](./images/10-sua-khoan.svg)

Nói `cà phê sửa thành 35k` hoặc `cà phê hôm qua là 35k`:

1. App lấy mọi khoản trong **120 ngày** gần nhất.
2. Nếu câu là lời sửa, hoặc mô hình đặt cờ sửa, bản nháp được gắn vào khoản cũ: số cũ, danh mục cũ, ngày cũ.
3. Thẻ cập nhật trích khoản gốc. Bấm dòng trích thì hội thoại nhảy tới biên lai đó và nháy sáng một giây.
4. **Cập nhật** sửa đúng dòng `tx` đã có, không tạo id mới, và cập nhật mọi biên lai của khoản đó.
5. **Sửa số** chỉ đổi số tiền trên thẻ cập nhật trước khi bấm Cập nhật.
6. Câu là lời sửa mà khoảng đó không có khoản khớp thì app không tạo thẻ và không ghi khoản mới. Câu trả lời nói rõ chưa có gì để sửa. Muốn ghi bù thì nói một câu ghi mới, ví dụ `ghi hôm qua ăn 100k`.
7. Ngày mai, ngày kia, tuần sau, tháng sau và mọi ngày sau hôm nay chưa có trên sổ. App không ghi trước, cũng không sửa một khoản chưa có.

Khoảng trong lời sửa đọc từ câu nói: hôm nay, hôm qua, hôm kia, ngày mai, ngày kia, N ngày trước hoặc nữa, thứ trong tuần, đầu tuần, cuối tuần, tuần này, tuần trước, tuần sau, đầu tháng, cuối tháng, tháng này, tháng trước, tháng sau, năm nay, năm trước, năm sau. Đúng một ngày thì tìm ngày đó. Cả tuần hoặc cả tháng thì tìm trong khoảng; khi khớp, ngày của khoản cũ được giữ nguyên.

`hôm qua tui ăn 100k chứ không phải 50k` mà hôm qua không có bữa ăn: app không sửa thành 100k. Nếu hôm qua có một bữa ăn đúng 50k thì thẻ cập nhật trỏ khoản đó. Nếu bữa ăn đang là số khác, app nói số đang lưu và không đổi.

Khoản cũ hơn 120 ngày không nằm trong đối chiếu. Lời sửa trong khoảng đó không tạo khoản mới. Câu ghi mới, ví dụ `quên ghi`, vẫn tạo nháp.

Đổi danh mục thì trừ lượt dùng của tên cũ và cộng tên mới.

## 10. Sửa, xoá, thử lại trong hội thoại

**Bấm một bong bóng của mình** mở hàng nút:

- **Thử lại** — xoá câu trả lời và thẻ phía sau, gửi lại đúng câu.
- **Sửa** rồi **Gửi lại** — đổi chữ và phân tích lại. Ghi âm không sửa chữ được.
- **Sao chép** — chép câu vào clipboard. Ghi âm không chép file.

**Nhấn giữ** bong bóng của mình hoặc câu trả lời mở hộp **Xoá đoạn chat?** Đồng ý thì xoá tin, câu trả lời, thẻ, và mọi khoản đã lưu trong đoạn đó, rồi chèn dòng *Đã xoá đoạn chat*. Tổng trên đảo được tính lại.

Xoá một khoản đã lưu trên thẻ không xoá hội thoại ngay. Thẻ đổi nhãn **Đã xoá** và đếm **Hoàn tác** trong **8 giây**. Hết giờ, nếu đoạn không còn khoản sống, app xoá nốt tin và câu trả lời của lượt đó.

## 11. Thanh đảo

![Đảo mở: tổng ngày, danh sách khoản, tổng tháng](./images/05-thanh-dao.svg)

Ba trạng thái:

| Trạng thái | Hiện gì |
| --- | --- |
| Viên thuốc | Ngày dạng `Thứ ba, 27/10`, thu nếu có, chi nếu có |
| Báo vừa ghi | Tiêu đề đã lưu và **Hoàn tác**, khoảng 2,8 giây |
| Bảng ngày | Thu, chi, số giao dịch, danh sách khi bấm **Xem tất cả**, chi tiêu tháng và dòng tiền ra |

Bấm viên thuốc để mở bảng. Bấm nền mờ hoặc đầu bảng để đóng. Ngày không có khoản thì bảng viết *Chưa có khoản nào hôm nay* hoặc *Chưa có khoản nào ngày này*.

Tổng trên đảo đọc bảng `tx`. Tổng trên mốc ngày trong chat cộng biên lai đang hiện, mỗi khoản một lần.

## 12. Menu bên

![Menu: hồ sơ, tháng này, chat theo ngày, danh mục, Gmail, nền, reset](./images/06-menu.svg)

- Hồ sơ: tên và email Gmail, hoặc **Bạn** / *Dùng trên máy này* khi chưa đăng nhập.
- Dòng **Tháng này** hiện thu và chi.
- **Chat theo ngày** liệt kê ngày có hội thoại, kèm tổng và số khoản suy từ biên lai. Bấm một ngày thì đóng menu, đảo nhảy sang ngày đó, hội thoại cuộn tới mốc ngày.
- Nút xoá trên một ngày hỏi *Xoá ngày này?* Mọi tin và khoản của ngày bị xoá, không hoàn tác qua đảo.
- **Quản lý danh mục** mở `/danh-muc`.
- **Gắn Gmail** hoặc **Đăng xuất**.
- **Nền sáng** / **Nền tối** xoay giao diện: theo máy, rồi sáng, rồi tối.
- **Reset dữ liệu** xoá hết khoản và tin, đưa số lần dùng danh mục về 0. Danh mục và nút ghi nhanh giữ nguyên. Hộp thoại nói rõ không hoàn tác được.

## 13. Danh mục

![Danh mục đang dùng, xếp theo số lần, và nhóm đã ẩn](./images/07-danh-muc.svg)

Mười tám danh mục seed, theo thứ tự ưu tiên khi chưa có thói quen: Ăn uống, Đồ uống, Đi lại, Xăng, Bảo dưỡng xe, Tạp hoá, Hoá đơn, Nhà ở, Sức khoẻ, Làm đẹp, Mua sắm, Giải trí, Học tập, Gia đình, Thú cưng, Du lịch, Thu nhập, Khác.

Danh sách đang hiện xếp theo số lần dùng, rồi thứ tự seed. Mỗi dòng có icon, tên, số lần, và nút ẩn. Không ẩn được danh mục cuối cùng đang hiện.

**Đã ẩn** vẫn còn trong sổ. Bấm mắt để hiện lại. Ẩn không xoá các khoản cũ mang tên đó.

**Thêm danh mục** mở hộp: tên và một icon trong bộ có sẵn. Tên trùng, không phân biệt hoa thường, thì cập nhật dòng cũ thay vì tạo dòng mới. Đổi tên danh mục đã có cũng đổi tên trên mọi khoản và mọi nút ghi nhanh.

Gemini chỉ được chọn tên đang hiện. Không nghĩ ra danh mục mới; không khớp thì về **Khác**. Một số cụm bị ghép sẵn trước khi hiện thẻ, ví dụ trà sữa và cà phê vào Đồ uống, đổ xăng vào Xăng, Grab vào Đi lại, lương vào Thu nhập.

## 14. Tài khoản

![Đăng nhập Gmail, có lối bỏ qua](./images/01-dang-nhap.svg)

Màn có hai tab **Đăng nhập** và **Đăng ký**. Cả hai đều mở cùng một luồng Gmail qua Supabase. Nút ghi *Đang mở Gmail…* khi trình duyệt xác thực đang chạy.

**Dùng không cần tài khoản** về sổ chat. Chưa khai báo `EXPO_PUBLIC_SUPABASE_URL` và `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` thì nút Gmail không hiện, chỉ còn cảnh báo cấu hình và lối bỏ qua.

Đăng xuất xoá phiên trên máy. File sổ không đổi chủ, vì sổ không có `user_id`.

## 15. Khi mô hình lỗi

Hàng lỗi thay cho câu trả lời, kèm **Thử lại**:

| Tình huống | Câu trên màn |
| --- | --- |
| Mất mạng hoặc lỗi không rõ | Mình không kết nối được. Kiểm tra mạng rồi thử lại nhé. |
| Khoá API không hợp lệ | Khoá API không hợp lệ. Kiểm tra lại cấu hình. |
| Quá tải | Đang quá tải. Thử lại sau vài giây. |
| Câu trả lời hỏng | Có lỗi khi xử lý câu này. Thử lại giúp mình. |

Mỗi lần gọi chờ tối đa 20 giây rồi thử model dự phòng. Thử lại trên hàng lỗi gửi lại chữ hoặc file ghi âm của lượt đó.

## Vòng đời một khoản

```text
câu nói / ghi âm / nút nhanh
        │
        ▼
   tin người dùng + câu trả lời
        │
        ▼
   nháp          chưa có dòng tx
        │  xác nhận, hoặc hết 5 giây
        ▼
   biên lai       một dòng tx
        │  xoá trên thẻ
        ▼
   đã xoá         còn 8 giây để hoàn tác
        │  hết giờ
        ▼
   gỡ tin của lượt, nếu không còn khoản sống
```

Sửa khoản đã có đi từ nháp-có-revision thẳng tới cùng `tx` cũ, không sinh id mới.

## Những việc app cố ý không làm

- Không ghi sổ khi người dùng chưa xác nhận, trừ khi họ để hết 5 giây trên thẻ đang chờ.
- Không tin số tiền trong câu trả lời của mô hình khi người dùng đang hỏi tổng.
- Không đồng bộ sổ lên Supabase.
- Không có ngân sách, nợ, mục tiêu, hay báo cáo ngoài câu trả lời và thanh đảo.
- Không sửa danh sách nút ghi nhanh trong giao diện.
- Không biến lời sửa thành khoản mới khi khoảng ngày đó chưa có khoản khớp.
- Không ghi khoản cho ngày sau hôm nay.
