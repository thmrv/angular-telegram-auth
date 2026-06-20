requests.post(
      "https://luckystack.redpillvps.pro/api/auth/login/telegram",
      headers={"Content-Type": "application/json"},
      json={
          "id": 1,
          "first_name": "",
          "last_name": "",
          "username": "",
          "photo_url": "",
          "auth_date": 1,
          "hash": ""
      }
  )
