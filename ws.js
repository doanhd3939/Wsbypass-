// == Bypass Tool - WebSocket Automation Script ==
// Đã chỉnh sửa: chuẩn hóa code, tối ưu cú pháp, vẫn giữ nguyên tất cả tính năng gốc.

(async () => {
    const WEBSOCKET_URI = "ws://localhost:8765";
    const COUNTDOWN_SECONDS = 77;
    const MAX_CONNECTION_RETRIES = 10;
    const RETRY_CONNECTION_DELAY = 5000;
    const TASK_CHECK_INTERVAL = 3000;

    const XPATHS = {
        keyword: '//*[@id="TK1"]',
        inputField: '//*[@id="gt-form"]/div[1]/input',
        submitButton: '//*[@id="btn-xac-nhan"]',
        errorButton: '//*[@id="btn-baoloi"]',
        changeReasonButton: '//*[@id="lydo_doima"]/center/a[2]/div/strong',
        reasonCheckbox: '//*[@id="lydo_doima"]/label[4]/input',
        confirmChangeButton: '//*[@id="dongy_doima"]/a/div/strong',
    };

    let ws = null;
    let receivedCode = null;
    let countdownFinished = false;
    let isTaskActive = false;
    let connectionRetries = 0;

    const log = (message) => {
        // Có thể thay thế console.log thành render ra UI nếu muốn
        console.log(`[Bypass Tool] ${message}`);
    };

    const xpath = (path) =>
        document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Hàm click phần tử qua xpath, trả về true/false và có log rõ ràng
    const clickElementByXpath = async (path) => {
        log(`Đang tìm và click vào phần tử: ${path}`);
        const element = xpath(path);
        if (element) {
            element.click();
            log(`Đã click thành công.`);
            await sleep(250);
            return true;
        }
        log(`Lỗi: Không tìm thấy phần tử để click: ${path}`);
        return false;
    };

    // Hàm nhập liệu giả lập người dùng (giữ nguyên tính năng gốc)
    const typeHumanLike = async (element, text) => {
        log(`Bắt đầu nhập mã: ${text}`);
        for (const char of text) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(Math.random() * 150 + 50);
        }
        log(`Nhập mã hoàn tất.`);
    };

    // Xử lý khi keyword không hợp lệ (vẫn đủ quy trình đổi mã)
    const handleInvalidKeyword = async () => {
        log("Từ khóa không hợp lệ. Bắt đầu quy trình đổi từ khóa...");
        await clickElementByXpath(XPATHS.errorButton);
        await sleep(1000);
        await clickElementByXpath(XPATHS.changeReasonButton);
        await sleep(1000);
        await clickElementByXpath(XPATHS.reasonCheckbox);
        await clickElementByXpath(XPATHS.confirmChangeButton);
        log("Hoàn tất quy trình đổi từ khóa. Trang sẽ sớm tải lại.");
        isTaskActive = false;
    };

    // Hàm nhập code và submit
    const enterCodeAndSubmit = async (code) => {
        log("Countdown đã kết thúc và đã nhận được mã. Bắt đầu nhập liệu.");
        const inputField = xpath(XPATHS.inputField);
        if (inputField) {
            await typeHumanLike(inputField, code);
            await sleep(500);
            await clickElementByXpath(XPATHS.submitButton);
        } else {
            log(`Lỗi: Không tìm thấy ô nhập mã tại xpath: ${XPATHS.inputField}`);
        }
    };

    // Đếm ngược cho mỗi tác vụ
    const startCountdown = () => {
        let timeLeft = COUNTDOWN_SECONDS;
        countdownFinished = false;
        receivedCode = null;
        const timerId = setInterval(() => {
            if (!isTaskActive) {
                clearInterval(timerId);
                log("Tác vụ đã bị hủy, dừng đếm ngược.");
                return;
            }
            if (timeLeft <= 0) {
                clearInterval(timerId);
                log("Đếm ngược kết thúc.");
                countdownFinished = true;
                if (receivedCode) enterCodeAndSubmit(receivedCode);
                return;
            }
            log(`Đang đếm ngược, còn lại: ${timeLeft} giây...`);
            timeLeft--;
        }, 1000);
    };

    // Kết nối WebSocket với server và tự động reconnect nếu lỗi
    const connectToServer = () => {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        if (connectionRetries >= MAX_CONNECTION_RETRIES) {
            log(`Đã thử kết nối ${MAX_CONNECTION_RETRIES} lần và thất bại. Dừng lại.`);
            return;
        }
        connectionRetries++;
        log(`Đang kết nối tới server... (Lần ${connectionRetries}/${MAX_CONNECTION_RETRIES})`);
        ws = new WebSocket(WEBSOCKET_URI);

        ws.onopen = () => {
            log("Kết nối tới server thành công.");
            connectionRetries = 0;
        };

        ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                log("Lỗi khi parse dữ liệu từ server.");
                return;
            }
            log(`Nhận được tin nhắn từ server: ${JSON.stringify(data)}`);
            if (data.type === "code_result" && data.code) {
                receivedCode = data.code;
                log(`Đã nhận được mã: ${receivedCode}`);
                if (countdownFinished) enterCodeAndSubmit(receivedCode);
            } else if (data.type === "task_failed") {
                if (data.reason === "invalid_keyword") {
                    handleInvalidKeyword();
                } else {
                    log(`Server báo tác vụ thất bại: ${data.reason}. Sẽ thử lại ở lần kiểm tra sau.`);
                    isTaskActive = false;
                }
            }
        };

        ws.onclose = () => {
            log(`Mất kết nối với server. Sẽ thử kết nối lại sau ${RETRY_CONNECTION_DELAY / 1000} giây.`);
            ws = null;
            setTimeout(connectToServer, RETRY_CONNECTION_DELAY);
        };

        ws.onerror = (err) => {
            log("Lỗi WebSocket. Kết nối sẽ tự đóng và thử lại.");
            ws.close();
        };
    };

    // Hàm chính kiểm tra từ khóa mới và gửi yêu cầu tới server
    const mainTaskExecutor = () => {
        if (isTaskActive) return;

        const keywordElement = xpath(XPATHS.keyword);
        const keyword = keywordElement ? keywordElement.innerText.trim() : null;

        if (keyword) {
            log(`Tìm thấy từ khóa mới: "${keyword}". Bắt đầu xử lý.`);
            isTaskActive = true;

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                log("Chưa có kết nối tới server. Đang đợi kết nối...");
                isTaskActive = false;
                return;
            }

            log(`Gửi yêu cầu xử lý từ khóa "${keyword}" tới server.`);
            ws.send(JSON.stringify({ type: "start_task", keyword: keyword }));
            startCountdown();
        }
    };

    // Khởi động script
    log("Bypass tool đã khởi động. Bắt đầu vòng lặp kiểm tra tác vụ.");
    connectToServer();
    setInterval(mainTaskExecutor, TASK_CHECK_INTERVAL);

    // Nếu muốn render ra UI, có thể bổ sung thêm code ở đây, ví dụ tạo popup, modal...
})();
