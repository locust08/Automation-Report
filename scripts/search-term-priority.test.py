from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace

path = Path(__file__).with_name("order-search-term-candidates.py")
spec = spec_from_file_location("priority", path)
module = module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

rows = [
    SimpleNamespace(campaign_id="1", ad_group_id="1", search_term="low", cost=1, impressions=1000),
    SimpleNamespace(campaign_id="9", ad_group_id="9", search_term="high", cost=50, impressions=1),
    SimpleNamespace(campaign_id="2", ad_group_id="2", search_term="equal low impressions", cost=10, impressions=5),
    SimpleNamespace(campaign_id="3", ad_group_id="3", search_term="equal high impressions", cost=10, impressions=50),
    SimpleNamespace(campaign_id="4", ad_group_id="4", search_term="z tie", cost=5, impressions=5),
    SimpleNamespace(campaign_id="4", ad_group_id="4", search_term="a tie", cost=5, impressions=5),
]
ordered = module.sort_rows(rows)
assert [row.search_term for row in ordered] == ["high", "equal high impressions", "equal low impressions", "a tie", "z tie", "low"]
print("priority ordering passed")
