// 핵심 흐름 자동 테스트 (e2e/). Supabase를 통째로 띄운 상태에서 앱을 켜고 브라우저로 누른다.
// 실행: GitHub Actions(.github/workflows/ci.yml)가 한다. 내 컴퓨터에서는 Docker를 켜고 README "자동 테스트"를 따른다.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
