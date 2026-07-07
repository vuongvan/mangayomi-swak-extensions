// Mangayomi JS source — TruyenQQ (truyenqqko.com)
// Converted from a vBook app plugin (home.js / genre.js / search.js / detail.js / toc.js / chap.js / bypass.js / config.js)
// to the Mangayomi "MProvider" JS extension format.
// Reference format: https://github.com/kodjodevf/mangayomi-extensions/tree/main/javascript/manga/src/en

const mangayomiSources = [{
    "id": 837201455,
    "name": "TruyenQQ",
    "lang": "vi",
    "baseUrl": "https://truyenqqko.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://truyenqqko.com",
    "typeSource": "single",
    "itemType": 0,
    "version": "1.0.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/vi/truyenqq.js"
}];

class DefaultExtension extends MProvider {

    // ---------- basic helpers ----------

    getBaseUrl() {
        const preference = new SharedPreferences();
        const base = preference.get("override_base_url");
        if (base && base.length > 0) {
            return base.endsWith("/") ? base.slice(0, -1) : base;
        }
        return this.source.baseUrl;
    }

    getHeaders() {
        return {
            "Referer": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        };
    }

    absUrl(url) {
        if (!url) return this.getBaseUrl();
        if (url.startsWith("http")) return url;
        return this.getBaseUrl() + (url.startsWith("/") ? url : "/" + url);
    }

    // Some pages on this site set `document.cookie = "..."` via an inline script
    // and require that cookie to be sent back before serving the real content.
    // This replicates the original plugin's `bypass()` logic.
    async bypassCookie(url, res) {
        const match = res.body.match(/document\.cookie\s*=\s*"([^"]*)"/);
        if (match) {
            const headers = Object.assign({}, this.getHeaders(), { "Cookie": match[1] });
            res = await new Client().get(url, headers);
        }
        return res;
    }

    async request(url) {
        let res = await new Client().get(url, this.getHeaders());
        res = await this.bypassCookie(url, res);
        return new Document(res.body);
    }

    // ---------- manga list (popular / latest / genre / sort / search) ----------

    async getMangaList(path, page, query) {
        page = page || 1;
        const p = path.replace(/\/$/, "");
        let url = `${this.getBaseUrl()}${p}/trang-${page}`;
        if (query) {
            url += `?q=${encodeURIComponent(query)}`;
        }
        const doc = await this.request(url);

        const list = [];
        doc.select("#main_homepage .list_grid li").forEach((e) => {
            const imgEl = e.selectFirst(".book_avatar img");
            let imageUrl = imgEl ? imgEl.attr("src") : "";
            if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;

            const nameEl = e.selectFirst(".book_name");
            const linkEl = e.selectFirst(".book_name a");
            const name = nameEl ? nameEl.text.trim() : "";
            const link = linkEl ? linkEl.attr("href") : "";

            if (name && link) {
                list.push({ name, imageUrl, link });
            }
        });

        const hasNextPage = doc.selectFirst(".page_redirect a:has(p.active) + a") !== null;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        return await this.getMangaList("/top-ngay", page, null);
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return await this.getMangaList("/truyen-moi-cap-nhat", page, null);
    }

    async search(query, page, filters) {
        if (query && query.trim().length > 0) {
            return await this.getMangaList("/tim-kiem", page, query.trim());
        }

        let path = "/truyen-moi-cap-nhat";
        if (filters && filters.length >= 2) {
            const sortFilter = filters[0];
            const genreFilter = filters[1];
            if (genreFilter && genreFilter.state > 0) {
                path = genreFilter.values[genreFilter.state].value;
            } else if (sortFilter && sortFilter.state > 0) {
                path = sortFilter.values[sortFilter.state].value;
            }
        }
        return await this.getMangaList(path, page, null);
    }

    // ---------- manga detail ----------

    buildDetailLines(doc) {
        const lines = [];
        doc.select(".book_info .list-info li").forEach((item) => {
            const labelEl = item.selectFirst(".name");
            const label = labelEl ? labelEl.text.replace(/\s+/g, " ").trim() : "";

            const pNodes = item.select("p");
            if (!pNodes || pNodes.length === 0) return;
            const valueNode = pNodes[pNodes.length - 1];
            const value = valueNode && valueNode.text ? valueNode.text.replace(/\s+/g, " ").trim() : "";

            if (!label || !value || label === value) return;
            lines.push(`${label}: ${value}`);
        });
        return lines.join("\n");
    }

    async getDetail(url) {
        const fullUrl = this.absUrl(url);
        const doc = await this.request(fullUrl);

        const imgEl = doc.selectFirst(".book_avatar img");
        let imageUrl = imgEl ? imgEl.attr("src") : "";
        if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;

        const nameEl = doc.selectFirst("h1[itemprop=name]");
        const name = nameEl ? nameEl.text.trim() : "";

        const authorEl = doc.selectFirst(".book_info .author a.org");
        const author = authorEl ? authorEl.text.trim() : "";

        const statusEl = doc.selectFirst(".book_info .status");
        const statusText = statusEl ? statusEl.text.replace(/\s+/g, " ").trim() : "";
        // 0 = ongoing, 1 = completed
        const status = statusText.indexOf("Hoàn Thành") !== -1 ? 1 : 0;

        const genre = [];
        doc.select(".book_info .list01 a").forEach((e) => {
            const t = e.text.trim();
            if (t) genre.push(t);
        });

        const descEl = doc.selectFirst("div.story-detail-info");
        let description = descEl ? descEl.text.trim() : "";
        const extra = this.buildDetailLines(doc);
        if (extra) description = description ? `${description}\n\n${extra}` : extra;

        const chapters = [];
        doc.select(".works-chapter-list a").forEach((e) => {
            const cname = e.text.trim();
            const curl = e.attr("href");
            if (cname && curl) chapters.push({ name: cname, url: curl });
        });

        return { name, imageUrl, author, status, genre, description, chapters };
    }

    // ---------- chapter pages ----------

    // The site's CDN mirrors change often; this maps a few known dead/alternate
    // hosts to a currently-working one, same as the original plugin did.
    fixImageDomain(link) {
        if (link.indexOf("mangaqq.net") > -1 || link.indexOf("cdnqq.xyz") > -1) {
            link = link.replace("mangaqq.net", "i200.truyenvua.com").replace("cdnqq.xyz", "i200.truyenvua.com");
        } else if (link.indexOf("mangaqq.com") > -1) {
            link = link.replace("mangaqq.com", "i216.truyenvua.com");
        } else if (link.indexOf("trangshop.net") > -1 || link.indexOf("photruyen.com") > -1 || link.indexOf("tintruyen.com") > -1) {
            link = link
                .replace("photruyen.com", "i109.truyenvua.com")
                .replace("tintruyen.com", "i109.truyenvua.com")
                .replace("trangshop.net", "i109.truyenvua.com");
        } else if (link.indexOf("tintruyen.net") > -1) {
            link = link
                .replace("//tintruyen.net", "//i138.truyenvua.com")
                .replace("//i125.tintruyen.net", "//i125.truyenvua.com");
        } else if (link.indexOf("qqtaku.com") > -1) {
            link = link.replace("qqtaku.com", "i125.truyenvua.com");
        }
        return link;
    }

    async getPageList(url) {
        const fullUrl = this.absUrl(url);
        const doc = await this.request(fullUrl);

        const imgs = doc.select(".chapter_content img.lazy");
        const pages = [];
        for (const img of imgs) {
            let link = img.attr("src");
            if (!link) {
                const original = img.attr("data-original");
                if (original) link = this.fixImageDomain(original);
            }
            if (link) {
                pages.push({ url: link, headers: { "Referer": this.getBaseUrl() } });
            }
        }
        return pages;
    }

    // ---------- filters & preferences ----------

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sắp xếp",
                state: 0,
                values: [
                    ["Mới cập nhật", "/truyen-moi-cap-nhat"],
                    ["Top ngày", "/top-ngay"],
                    ["Top tuần", "/top-tuan"],
                    ["Top tháng", "/top-thang"],
                    ["Yêu thích", "/truyen-yeu-thich"],
                    ["Truyện mới", "/truyen-tranh-moi"],
                    ["Truyện full", "/truyen-hoan-thanh"],
                    ["Ngẫu nhiên", "/truyen-ngau-nhien"],
                ].map((x) => ({ type_name: "SelectOption", name: x[0], value: x[1] })),
            },
            {
                type_name: "SelectFilter",
                name: "Thể loại",
                state: 0,
                // NOTE: truyenqqko.com uses numeric ids in its genre slugs
                // (/the-loai/<slug>-<id>) that aren't guessable. Only genres
                // confirmed to exist are listed here — add more following the
                // same "/the-loai/slug-id" pattern if you find them.
                values: [
                    ["Tất cả", ""],
                    ["Action", "/the-loai/action-26"],
                    ["Drama", "/the-loai/drama-29"],
                    ["Shounen", "/the-loai/shounen-31"],
                    ["Manhua", "/the-loai/manhua-35"],
                    ["Romance", "/the-loai/romance-36"],
                    ["Manhwa", "/the-loai/manhwa-49"],
                    ["Sci-fi", "/the-loai/sci-fi-43"],
                    ["Historical", "/the-loai/historical-51"],
                    ["Webtoon", "/the-loai/webtoon-55"],
                    ["Chuyển Sinh", "/the-loai/chuyen-sinh-91"],
                ].map((x) => ({ type_name: "SelectOption", name: x[0], value: x[1] })),
            },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Ghi đè tên miền (override domain)",
                    summary: "Dùng khi trang đổi tên miền, để trống để dùng mặc định",
                    value: "",
                    dialogTitle: "Nhập domain mới",
                    dialogMessage: "Ví dụ: https://truyenqqto.com",
                },
            },
        ];
    }
}
