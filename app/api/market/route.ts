export const runtime = "edge";

const PERIOD_LIMITS: Record<string, number> = { day: 255, week: 54, month: 13 };

function normalizeSymbol(input: string) {
  const digits = input.toUpperCase().replace(/^(SH|SZ|BJ)/, "").replace(/\.(SH|SZ|BJ)$/, "").trim();
  if (!/^\d{6}$/.test(digits)) throw new Error("请输入 6 位沪深 A 股代码，例如 600519");
  return digits;
}

function marketPrefix(symbol: string) {
  if (symbol.startsWith("6") || symbol.startsWith("9")) return "sh";
  if (symbol.startsWith("4") || symbol.startsWith("8")) return "bj";
  return "sz";
}

type TencentPayload = {
  code: number;
  msg?: string;
  data?: Record<string, {
    qt?: Record<string, string[]>;
    qfqday?: string[][];
    qfqweek?: string[][];
    qfqmonth?: string[][];
    day?: string[][];
    week?: string[][];
    month?: string[][];
  }>;
};

async function fetchTencent(key: string, period: string, limit: number) {
  const param = `${key},${period},,,${limit},qfq`;
  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(param)}`, {
    headers: { Accept: "application/json", Referer: "https://gu.qq.com/" },
  });
  if (!response.ok) throw new Error(`行情服务暂时不可用（${response.status}）`);
  return (await response.json()) as TencentPayload;
}

function aggregateRows(rows: string[][], period: "week" | "month") {
  const grouped = new Map<string, string[][]>();
  for (const row of rows) {
    const date = new Date(`${row[0]}T00:00:00Z`);
    let key = row[0].slice(0, 7);
    if (period === "week") {
      const offset = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - offset);
      key = date.toISOString().slice(0, 10);
    }
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return [
      last[0],
      first[1],
      last[2],
      String(Math.max(...group.map((row) => Number(row[3])))),
      String(Math.min(...group.map((row) => Number(row[4])))),
      String(group.reduce((sum, row) => sum + Number(row[5]), 0)),
    ];
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const symbol = normalizeSymbol(url.searchParams.get("symbol") || "600519");
    const period = url.searchParams.get("period") || "day";
    const years = Math.min(5, Math.max(1, Number(url.searchParams.get("years")) || 2));
    if (!PERIOD_LIMITS[period]) throw new Error("不支持的 K 线周期");
    const prefix = marketPrefix(symbol);
    const key = `${prefix}${symbol}`;
    const limit = PERIOD_LIMITS[period] * years;
    let payload = await fetchTencent(key, period, limit);
    let quote = payload.data?.[key];
    let rows = quote?.[`qfq${period}` as "qfqday" | "qfqweek" | "qfqmonth"] || quote?.[period as "day" | "week" | "month"];
    if ((!rows?.length) && period !== "day") {
      const dailyPayload = await fetchTencent(key, "day", PERIOD_LIMITS.day * years);
      const dailyQuote = dailyPayload.data?.[key];
      const dailyRows = dailyQuote?.qfqday || dailyQuote?.day;
      if (dailyRows?.length) {
        payload = dailyPayload;
        quote = dailyQuote;
        rows = aggregateRows(dailyRows, period as "week" | "month");
      }
    }
    if (payload.code !== 0 || !quote || !rows?.length) throw new Error(payload.msg || "未找到该代码的行情数据");
    const quoteFields = quote.qt?.[key];

    const bars = rows
      .map((fields, index) => {
        return {
          index,
          timestamp: fields[0],
          open: Number(fields[1]),
          close: Number(fields[2]),
          high: Number(fields[3]),
          low: Number(fields[4]),
          volume: Number(fields[5]),
        };
      })
      .filter((bar) => [bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite));

    if (bars.length < 12) throw new Error("有效 K 线不足，无法进行结构分析");
    return Response.json(
      {
        symbol,
        name: quoteFields?.[1] || symbol,
        market: prefix === "sh" ? "沪市" : prefix === "bj" ? "北交所" : "深市",
        period,
        adjustment: "前复权",
        bars,
      },
      { headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析请求失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
