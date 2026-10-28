import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "개인정보 처리방침 · 원스텝" };

// 처리방침을 고칠 때마다 시행일을 바꾸고 아래 "바뀐 내용"에 한 줄 남긴다.
// 문구는 개인정보보호위원회 처리방침 작성지침의 항목 순서를 따른다. 실제 운영 전에 법률·세무 검토를 받는다.
const EFFECTIVE_DATE = "2026년 11월 1일";
const HISTORY = [{ date: "2026년 11월 1일", note: "처음 만듦 (시범 운영)" }];

interface CompanyInfo {
  name: string;
  ceo: string;
  address: string;
  phone: string;
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-4 pt-2 text-lg font-bold">
      {children}
    </h2>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[320px] border-collapse text-[13px] leading-relaxed">
        <thead>
          <tr className="bg-ground text-left">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? "font-bold" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOC = [
  ["purpose", "1. 처리 목적"],
  ["items", "2. 처리하는 개인정보"],
  ["rrn", "3. 주민등록번호 처리"],
  ["period", "4. 보유 기간"],
  ["destroy", "5. 파기"],
  ["third", "6. 다른 곳에 제공"],
  ["outsource", "7. 처리 위탁과 국외 이전"],
  ["rights", "8. 정보주체의 권리"],
  ["safety", "9. 안전하게 지키는 방법"],
  ["cookie", "10. 쿠키"],
  ["officer", "11. 개인정보 보호책임자"],
  ["remedy", "12. 권익침해 구제"],
  ["change", "13. 시행일과 바뀐 내용"],
] as const;

// 개인정보 처리방침. 로그인하지 않아도 볼 수 있다 (가입 신청서·로그인 화면에서 연결).
export default async function PrivacyPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_company_info");
  const company: CompanyInfo = { name: "원스텝", ceo: "", address: "", phone: "", ...((data as Partial<CompanyInfo> | null) ?? {}) };
  const companyName = company.name || "원스텝";

  return (
    <PageShell>
      <article className="flex flex-col gap-4 text-[15px] leading-relaxed text-body">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-ink">개인정보 처리방침</h1>
          <p>
            {companyName}(이하 &ldquo;회사&rdquo;)는 진행요원 인력 관리 앱 &ldquo;원스텝&rdquo;을 운영하면서 회원의 개인정보를 「개인정보 보호법」에 따라
            처리합니다. 무엇을, 왜, 얼마나 오래 처리하는지 아래에 적었어요.
          </p>
          <p className="text-[13px] text-muted">시행일: {EFFECTIVE_DATE}</p>
        </header>

        <nav aria-label="목차" className="rounded-lg bg-white p-4 text-sm">
          <ol className="grid gap-1 sm:grid-cols-2">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-brand underline-offset-4 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <H2 id="purpose">1. 처리 목적</H2>
        <ul className="list-disc pl-5">
          <li>회원 가입과 본인 확인, 가입 승인</li>
          <li>일정 안내, 신청 접수, 선발, 출석 확인, 연락</li>
          <li>용역 계약서 작성과 전자서명, 계약 기록 보관</li>
          <li>보수 계산과 지급, 세금 원천징수와 신고</li>
          <li>앱 오류를 찾아 고치고 안전하게 운영</li>
        </ul>

        <H2 id="items">2. 처리하는 개인정보</H2>
        <Table
          head={["언제", "항목"]}
          rows={[
            ["가입 신청", "필수: 이름, 휴대폰 번호, 경력 연수 / 선택: 활동 가능 지역, 경력 사항, 추천인 이름"],
            ["로그인", "카카오·Google 계정의 이메일, 이름(닉네임), 프로필 사진, 계정 식별값"],
            ["첫 계약서 서명 전", "주민등록번호, 은행, 계좌번호, 예금주, 주소"],
            ["계약서 서명", "서명 이미지, 서명 시각, 접속 IP, 기기·브라우저 정보, 계약서 내용의 해시값"],
            ["활동하면서", "일정 신청·선발·출석(지각·불참 포함) 기록, 보수 지급 내역, 대표가 남기는 활동 기록"],
            ["앱을 쓰는 동안 자동으로", "오류가 난 화면 주소, 기기·브라우저 정보, 오류 내용과 시각"],
          ]}
        />

        <H2 id="rrn">3. 주민등록번호 처리</H2>
        <p>
          보수를 지급할 때 「소득세법」에 따라 세금을 원천징수하고 세무서에 지급명세서를 내야 해서, 법령에 근거해 주민등록번호를 받습니다. 처음 계약서에
          서명하기 전에 받고, 암호화해서 보관해요. 앱 화면에는 뒷자리를 가린 번호만 보여요.
        </p>

        <H2 id="period">4. 보유 기간</H2>
        <Table
          head={["정보", "보유 기간"]}
          rows={[
            ["가입 정보 (지역·경력·추천인 등)", "탈퇴할 때까지"],
            ["대표가 남긴 활동 기록, 알림", "탈퇴할 때까지"],
            [
              "정산 정보 (주민등록번호·계좌·주소)",
              "보수를 받은 적이 없으면 탈퇴할 때까지. 받은 적이 있으면 마지막 지급일이 속한 해의 다음 해부터 5년 (「국세기본법」 장부·증빙 보관)",
            ],
            ["서명한 계약서, 보수 지급 기록, 이름·휴대폰 번호", "계약·지급이 있었던 해의 다음 해부터 5년"],
            ["오류 기록", "180일"],
          ]}
        />
        <p className="text-[13px] text-muted">
          로그인 계정 정보(이메일 등)는 계약·지급 기록과 연결되어 있어, 위 기록의 보유 기간이 끝날 때 함께 지웁니다. 그 전에도 로그인 계정으로는 탈퇴한 뒤 앱을
          쓸 수 없어요.
        </p>

        <H2 id="destroy">5. 파기</H2>
        <p>
          보유 기간이 끝나거나 처리 목적을 이루면 지체 없이 데이터베이스에서 지워 되살릴 수 없게 합니다. 종이로 출력한 것은 분쇄하거나 태웁니다. 탈퇴하면 바로
          지우는 정보와 법에 따라 남기는 정보는 4번 표와 같아요.
        </p>

        <H2 id="third">6. 다른 곳에 제공</H2>
        <p>
          회원의 개인정보를 다른 곳에 제공하지 않습니다. 다만 법령에 따라 세무서 등 국가기관에 내야 하는 경우(지급명세서 등)는 예외입니다.
        </p>

        <H2 id="outsource">7. 처리 위탁과 국외 이전</H2>
        <p>앱을 운영하려고 아래 회사의 서비스를 씁니다. 이 회사들은 맡긴 일 외에는 개인정보를 쓰지 않아요.</p>
        <Table
          head={["회사 (나라)", "맡긴 일", "정보가 있는 곳"]}
          rows={[
            ["Supabase Inc. (미국)", "데이터베이스 저장, 로그인 처리", "대한민국 서울 데이터센터"],
            ["Netlify, Inc. (미국)", "앱 화면을 보여 주는 서버 운영", "미국 등 Netlify 서버 (화면을 보여 주는 동안만 거침)"],
          ]}
        />
        <p className="text-[13px] text-muted">
          국외 이전: 앱을 쓸 때 위 2번의 정보가 인터넷으로 위 회사의 서버를 거치거나 저장됩니다. 보유 기간은 4번과 같아요. 국외 이전을 원하지 않으면 가입하지 않거나
          탈퇴할 수 있지만, 그러면 앱을 쓸 수 없어요. 카카오·Google 로그인은 회원이 고른 계정 회사의 처리방침을 따릅니다.
        </p>

        <H2 id="rights">8. 정보주체의 권리</H2>
        <ul className="list-disc pl-5">
          <li>내 개인정보를 보거나, 고치거나, 지우거나, 처리를 멈춰 달라고 요구할 수 있어요. 아래 보호책임자에게 연락하면 10일 안에 처리합니다.</li>
          <li>
            앱에서 바로 할 수도 있어요. 정산 정보는{" "}
            <Link href="/me" className="text-brand underline underline-offset-4">
              내 정보
            </Link>
            에서 고치고,{" "}
            <Link href="/withdraw" className="text-brand underline underline-offset-4">
              회원 탈퇴
            </Link>
            로 탈퇴할 수 있어요.
          </li>
          <li>법령에 따라 보관해야 하는 정보(4번)는 기간이 끝나기 전에는 지울 수 없어요.</li>
        </ul>

        <H2 id="safety">9. 안전하게 지키는 방법</H2>
        <ul className="list-disc pl-5">
          <li>주민등록번호와 계좌번호는 암호화(AES-256)해서 저장하고, 암호를 푸는 키는 데이터베이스와 따로 보관해요.</li>
          <li>정산 정보는 대표만 볼 수 있고, 원문을 볼 때마다 기록이 남아요.</li>
          <li>회원은 자기 정보만, 대표는 업무에 필요한 정보만 볼 수 있게 데이터베이스에서 권한을 나눠요.</li>
          <li>모든 통신은 암호화(HTTPS)해요.</li>
        </ul>

        <H2 id="cookie">10. 쿠키</H2>
        <p>로그인 상태를 유지하는 쿠키만 씁니다. 광고나 방문 분석 쿠키는 쓰지 않아요. 브라우저에서 쿠키를 막으면 로그인할 수 없어요.</p>

        <H2 id="officer">11. 개인정보 보호책임자</H2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 rounded-lg border border-line bg-white p-4 text-sm">
          <dt className="font-bold">회사</dt>
          <dd>{companyName}</dd>
          <dt className="font-bold">보호책임자</dt>
          <dd>{company.ceo ? `${company.ceo} (대표)` : "대표"}</dd>
          <dt className="font-bold">연락처</dt>
          <dd>{company.phone || "대표님께 받은 연락처로 문의해 주세요"}</dd>
          {company.address && (
            <>
              <dt className="font-bold">주소</dt>
              <dd>{company.address}</dd>
            </>
          )}
        </dl>

        <H2 id="remedy">12. 권익침해 구제</H2>
        <p>개인정보 침해로 도움이 필요하면 아래 기관에 문의할 수 있어요.</p>
        <ul className="list-disc pl-5 text-sm">
          <li>개인정보침해 신고센터: 118 (privacy.kisa.or.kr)</li>
          <li>개인정보 분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
          <li>대검찰청: 1301 (www.spo.go.kr)</li>
          <li>경찰청: 182 (ecrm.police.go.kr)</li>
        </ul>

        <H2 id="change">13. 시행일과 바뀐 내용</H2>
        <ul className="list-disc pl-5 text-sm">
          {HISTORY.map((h) => (
            <li key={h.date}>
              {h.date}: {h.note}
            </li>
          ))}
        </ul>
      </article>
    </PageShell>
  );
}
