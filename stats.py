import pandas as pd


def compute_growth(df):
    owned = df[df["status"] == "owned"].copy()
    owned["dateAdded"] = pd.to_datetime(owned["dateAdded"])
    owned["month"] = owned["dateAdded"].dt.to_period("M")

    by_month = owned.groupby("month").size()
    return {str(month): int(count) for month, count in by_month.items()}


def compute_overview(df):
    owned = df[df["status"] != "want"].copy()
    total_spent = owned["purchasePrice"].sum()

    rated = owned[owned["rating"] > 0]
    average_rating = rated["rating"].mean() if len(rated) else 0

    with_price = owned[owned["purchasePrice"].notna()]
    average_price = total_spent / len(with_price) if len(with_price) else 0
    missing_price = len(owned) - len(with_price)

    def top_counts(column, limit=5):
        counts = owned[owned[column].notna() & (owned[column] != "")][
            column
        ].value_counts()
        return [
            {"name": name, "count": int(count)}
            for name, count in counts.head(limit).items()
        ]

    def all_counts(column):
        counts = owned[owned[column].notna() & (owned[column] != "")][
            column
        ].value_counts()
        return {name: int(count) for name, count in counts.items()}

    def decade_label(year):
        if pd.isna(year) or not year:
            return None
        return str(int(year // 10 * 10)) + "s"

    owned["decade"] = owned["year"].apply(decade_label)

    return {
        "count": len(owned),
        "totalSpent": float(total_spent),
        "averagePrice": float(average_price),
        "averageRating": float(average_rating),
        "missingPrice": int(missing_price),
        "topArtists": top_counts("artist"),
        "topLabels": top_counts("label"),
        "topGenres": top_counts("genre"),
        "byGenre": all_counts("genre"),
        "byDecade": all_counts("decade"),
    }
