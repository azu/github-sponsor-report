import { graphql } from "@octokit/graphql";
import { Sponsorship, User } from "@octokit/graphql-schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
import path from "path";
import * as fs from "fs/promises";
import * as csv from "fast-csv";
// image
import * as vega from "vega";
import * as lite from "vega-lite";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GENERATE_ONLY_IMAGE = process.env.GENERATE_ONLY_IMAGE ? Boolean(process.env.GENERATE_ONLY_IMAGE) : false;
const PROJECT_ROOT_DIR = process.env.PROJECT_ROOT_DIR || process.env.GITHUB_WORKSPACE || path.join(__dirname, "../");
const OWNER_NAME = process.env.OWNER_NAME;
const IMG_DIR = path.join(PROJECT_ROOT_DIR, "./docs/img");
const SNAPSHOT_DIR = path.join(PROJECT_ROOT_DIR, "./snapshots");
if (!GITHUB_TOKEN) {
    throw new Error("No env.GITHUB_TOKEN");
}
if (!OWNER_NAME) {
    throw new Error("No env.REPOSITORY_NAME");
}
const graphqlWithAuth = graphql.defaults({
    headers: {
        authorization: `token ${GITHUB_TOKEN}`
    }
});
//
const QUERY = `query ($user: String!, $cursor: String) {
  user(login: $user) {
    sponsorshipsAsMaintainer(first: 100, after: $cursor, includePrivate: true) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        sponsorEntity {
          ... on User {
            login
          }
          ... on Organization {
            login 
          }
        }
        createdAt
        tier {
          monthlyPriceInDollars
          isOneTime
          isCustomAmount
        }
      }
    }
  }
}
`;

async function fetchSponsors(
    { results, cursor }: { results: Sponsorship[]; cursor?: string | undefined | null } = { results: [] }
) {
    const { user } = await graphqlWithAuth<{ user: User }>(QUERY, { cursor, user: OWNER_NAME });
    const nodes = user.sponsorshipsAsMaintainer.nodes as Sponsorship[];
    results.push(...nodes);

    if (user.sponsorshipsAsMaintainer.pageInfo.hasNextPage) {
        await fetchSponsors({ results, cursor: user.sponsorshipsAsMaintainer.pageInfo.endCursor });
    }

    return results;
}

export type Sponsor = {
    sponsorEntity: {
        login: string;
    };
    createdAt: string;
    tier: {
        monthlyPriceInDollars: number;
    };
};
export type SponsorSnapshot = {
    month: string;
    estimatedIncomeDollar: number;
    sponsors: Sponsor[];
    sponsorCount: number;
    newSponsorsCount: number;
}[];
export const fetchFormattedSponsors = async (): Promise<SponsorSnapshot> => {
    const sponsors = await fetchSponsors();
    const sortedSponsors = sponsors.sort((a, b) => a.createdAt - b.createdAt);
    const firstDate = dayjs(sortedSponsors[0].createdAt).utc().startOf("month");
    const lastDate = dayjs().utc().endOf("month");
    console.log(`OWNER_NAME: ${OWNER_NAME}`);
    console.log(firstDate.toISOString(), "~", lastDate.toISOString());
    let currentMonth = firstDate;
    const groupByMonth: { [index: string]: Sponsorship[] } = {};
    while (
        currentMonth.isBefore(lastDate) ||
        (currentMonth.isSame(lastDate, "year") && currentMonth.isSame(lastDate, "month"))
    ) {
        const month = currentMonth.format("YYYY-MM");
        groupByMonth[month] = [];
        sponsors.forEach((sponsor) => {
            const sponsorCreatedDate = dayjs(sponsor.createdAt).utc();
            if (
                sponsorCreatedDate.isBefore(currentMonth) ||
                (sponsorCreatedDate.isSame(currentMonth, "year") && sponsorCreatedDate.isSame(currentMonth, "month"))
            ) {
                groupByMonth[month].push(sponsor);
            }
        });
        currentMonth = currentMonth.add(1, "month");
    }
    // format data
    return Object.entries(groupByMonth).map(([monthKey, sponsors]) => {
        const estimatedIncomeDollar = sponsors.reduce((monthKey, sponsor) => {
            const dollars = sponsor.tier?.monthlyPriceInDollars;
            if (dollars === undefined) {
                throw new Error("Not found monthlyPriceInDollars");
            }
            return monthKey + dollars;
        }, 0);
        const newSponsors = sponsors.filter((sponsor) => {
            return dayjs(sponsor.createdAt).utc().format("YYYY-MM") == monthKey;
        });
        const newSponsorsCount = newSponsors.length;
        return {
            month: monthKey,
            estimatedIncomeDollar: estimatedIncomeDollar,
            sponsorCount: sponsors.length,
            sponsors: sponsors as Sponsor[],
            newSponsorsCount: newSponsorsCount
        };
    });
};

// Merge old YYYY-MM.json snapshot
export const mergeSnapshots = async (currentSnapshot: SponsorSnapshot): Promise<SponsorSnapshot> => {
    currentSnapshot.forEach((snapshotItem, index) => {
        if (!1) {
            return;
        }
        const month = snapshotItem.month;
        try {
            const oldSnapshot = require(path.join(SNAPSHOT_DIR, month + ".json")) as SponsorSnapshot;
            const sameMonth = oldSnapshot.find((oldItem) => oldItem.month === month);
            if (sameMonth) {
                currentSnapshot[index] = sameMonth;
            }
        } catch (error) {
            console.log("please import-all-sponsors.json");
            console.error(error);
        }
    });
    return currentSnapshot;
};

export async function run() {
    if (!GENERATE_ONLY_IMAGE) {
        await fs.mkdir(SNAPSHOT_DIR, {
            recursive: true
        });
    }
    await fs.mkdir(IMG_DIR, {
        recursive: true
    });
    const snapshot = await fetchFormattedSponsors();
    const items = Boolean(process.env.MERGE_OLD_SNAPSHOTS) ? await mergeSnapshots(snapshot) : snapshot;
    const snapshots = path.join(SNAPSHOT_DIR, dayjs().utc().format("YYYY-MM") + ".json");
    const index = path.join(SNAPSHOT_DIR, "index.json");
    if (!GENERATE_ONLY_IMAGE) {
        // JSON
        await fs.writeFile(snapshots, JSON.stringify(items, null, 4), "utf-8");
        await fs.writeFile(index, JSON.stringify(items, null, 4), "utf-8");

        // CSV
        await csv.writeToPath(
            path.join(SNAPSHOT_DIR, "index.csv"),
            items.map((item) => {
                return {
                    month: item.month,
                    estimatedIncomeDollar: item.estimatedIncomeDollar,
                    sponsorCount: item.sponsorCount,
                    newSponsorsCount: item.newSponsorsCount
                };
            }),
            {
                headers: true
            }
        );
    }
    // estimatedIncomeDollar
    const estimatedIncomeDollarSpec = lite.compile({
        $schema: "https://vega.github.io/schema/vega-lite/v2.0.json",
        description: "Estimated Income Dollar",
        width: 1024,
        height: 800,
        data: {
            values: items.map((item) => {
                return {
                    month: item.month,
                    estimatedIncomeDollar: item.estimatedIncomeDollar
                };
            })
        },
        mark: "bar",
        encoding: {
            x: { field: "month", type: "ordinal" },
            y: { field: "estimatedIncomeDollar", type: "quantitative" }
        }
    }).spec;
    const estimatedIncomeDollarView = new vega.View(vega.parse(estimatedIncomeDollarSpec), { renderer: "none" });
    const estimatedIncomeDollarSVG = await estimatedIncomeDollarView.toSVG();
    await fs.writeFile(path.join(IMG_DIR, "estimated_income_dollar.svg"), estimatedIncomeDollarSVG, "utf-8");
    // sponsorsSpec
    // https://vega.github.io/editor/#/examples/vega-lite/stacked_bar_h
    const sponsorsSpec = lite.compile({
        $schema: "https://vega.github.io/schema/vega-lite/v2.0.json",
        description: "Sponsors count",
        width: 1024,
        height: 800,
        transform: [
            {
                calculate: "if(datum.type === 'continuous_sponsors', 0, if(datum.type === 'new_sponsors', 1, 2))",
                as: "siteOrder"
            }
        ],
        data: {
            values: items.flatMap((item) => {
                return [
                    {
                        month: item.month,
                        type: "new_sponsors",
                        sponsor_count: item.newSponsorsCount,
                        sponsor_count_start: item.sponsorCount - item.newSponsorsCount,
                        sponsor_count_end: item.sponsorCount
                    },
                    {
                        month: item.month,
                        type: "continuous_sponsors",
                        sponsor_count: item.sponsorCount - item.newSponsorsCount,
                        sponsor_count_start: 0,
                        sponsor_count_end: item.sponsorCount - item.newSponsorsCount
                    }
                ];
            })
        },
        mark: "bar",
        encoding: {
            x: { field: "month", type: "ordinal" },
            y: {
                aggregate: "sum",
                field: "sponsor_count",
                type: "quantitative"
            },
            order: {
                field: "siteOrder"
            },
            color: {
                field: "type",
                type: "nominal"
            }
        }
    }).spec;
    const sponsorsView = new vega.View(vega.parse(sponsorsSpec), { renderer: "none" });
    const sponsorsSVG = await sponsorsView.toSVG();
    await fs.writeFile(path.join(IMG_DIR, "sponsors_count.svg"), sponsorsSVG, "utf-8");
}
