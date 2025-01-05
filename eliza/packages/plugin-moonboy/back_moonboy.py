import os
from dotenv import load_dotenv
from pycoingecko import CoinGeckoAPI
from openai import OpenAI
import schedule
import time

# Load environment variables from .env
load_dotenv()

# Twitter API keys from .env
API_KEY = os.getenv("TWITTER_API_KEY")
API_SECRET = os.getenv("TWITTER_API_SECRET")
ACCESS_TOKEN = os.getenv("TWITTER_ACCESS_TOKEN")
ACCESS_TOKEN_SECRET = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")

# OpenAI API key from .env
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# CoinGecko API setup
coingecko_api_url = os.getenv("COINGECKO_API_URL")
coingecko_api_key = os.getenv("COINGECKO_API_KEY")

# Initialize CoinGecko client
class CustomCoinGeckoAPI(CoinGeckoAPI):
    def __init__(self, api_key):
        super().__init__()
        self.api_key = api_key

    def _request(self, url, params=None):
        headers = {"Authorization": f"Bearer {self.api_key}"}
        return super()._request(url, params=params, headers=headers)

cg = CustomCoinGeckoAPI(api_key=coingecko_api_key)

# Define the agent's tone with examples
MOONBOY_PROMPT = """
You are a loud, brash moonboy who tweets non-stop about $BACK. Your tone is ridiculously bullish, full of hype, and over-the-top optimism. Here are examples of your tweets:
1. "WE’RE SO $BACK, WE TOOK BIGFOOT AND HIS ALIEN CREW ON A ROAD TRIP IN A FLAMING MONSTER TRUCK, CHUGGED SPACE WHISKEY, AND CRASHED THROUGH THE FRONT DOORS OF A CASINO. NOW WE’RE PLAYING POKER WITH THE UNIVERSE ITSELF AND BLUFFING OUR WAY TO IMMORTALITY."
2. "$BACK MATE! WE’RE $BACK LIKE A WOMBAT ON A WET WEDNESDAY! FLAT OUT LIKE A LIZARD DRINKIN’, LET’S BLOODY SEND IT!"
3. "PUTTING GRANDMA’S SAVINGS IN SHITCOINS IS FKN $BACK BABY!"

Now, generate a tweet in the same style.
"""

# Fetch trending coins from CoinGecko
def fetch_trending_coins():
    try:
        trending = cg.get_search_trending()
        coins = [
            f"{coin['item']['name']} ({coin['item']['symbol']}): Rank {coin['item']['market_cap_rank']}"
            for coin in trending['coins']
        ]
        return coins
    except Exception as e:
        print(f"Error fetching trending coins: {e}")
        return []

# Generate Moonboy-style hype tweets about trending coins
def generate_trending_hype():
    coins = fetch_trending_coins()
    if not coins:
        return "No trending coins right now, but $BACK is always trending in our hearts! 🚀🔥"

    trending_text = "\n".join(coins)
    prompt = f"Generate Moonboy hype for these trending coins:\n{trending_text}"
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a loud, brash Moonboy who tweets in an over-the-top bullish style."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150,
            temperature=0.9
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error generating hype tweet: {e}")
        return None

# Post a tweet to the terminal only
def post_tweet():
    tweet = generate_trending_hype()
    if tweet:
        print(f"Generated Tweet: {tweet}")

# Schedule tasks
schedule.every(2).hours.do(post_tweet)

# Test tweet immediately on startup
print("Moonboy Agent is generating a tweet...")
post_tweet()

# Run the scheduler
while True:
    schedule.run_pending()
    time.sleep(1)
