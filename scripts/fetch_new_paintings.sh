#!/bin/bash
# 补 9 幅圣经叙事画作（Wikimedia Commons 公版）
# 用法：bash fetch-9-paintings.sh
set -euo pipefail
cd ~/Desktop/classical-bible-paintings

echo ">>> 043  Temptation of Adam"
curl -sSL -o "043_Temptation of Adam_Jacopo Tintoretto.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Accademia_-_The_Temptation_of_Adam_by_Jacopo_Tintoretto.jpg/3840px-Accademia_-_The_Temptation_of_Adam_by_Jacopo_Tintoretto.jpg"
echo ">>> 011  Jacob’s Dream"
curl -sSL -o "011_Jacobs Dream_Jusepe de Ribera.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/El_sue%C3%B1o_de_Jacob%2C_by_Jos%C3%A9_de_Ribera%2C_from_Prado_in_Google_Earth.jpg/3840px-El_sue%C3%B1o_de_Jacob%2C_by_Jos%C3%A9_de_Ribera%2C_from_Prado_in_Google_Earth.jpg"
echo ">>> 032  Joseph's Tunic"
curl -sSL -o "032_Josephs Tunic_Diego Velázquez.jpg" "https://upload.wikimedia.org/wikipedia/commons/c/c9/Diego_Vel%C3%A1zquez_065.jpg"
echo ">>> 048  The Embarkation of the Queen of Sheba"
curl -sSL -o "048_The Embarkation of the Queen of Sheba_Claude Lorrain.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Claude_Lorrain_008.jpg/3840px-Claude_Lorrain_008.jpg"
echo ">>> 027  Ahasuerus and Haman at the Feast of Esther"
curl -sSL -o "027_Ahasuerus and Haman at the Feast of Esther_Rembrandt.jpg" "https://upload.wikimedia.org/wikipedia/commons/f/f4/Rembrandt_Harmensz_van_Rijn_-_Ahasuerus%2C_Haman_and_Esther_-_Google_Art_Project.jpg"
echo ">>> 016  Christ and the Woman Taken in Adultery"
curl -sSL -o "016_Christ and the Woman Taken in Adultery_Pieter Brueghel the Elder.jpg" "https://upload.wikimedia.org/wikipedia/commons/4/42/Pieter_Bruegel_%28I%29_-_Christ_and_the_woman_taken_in_adultery.jpg"
echo ">>> 087  Christ at the Sea of Galilee"
curl -sSL -o "087_Christ at the Sea of Galilee_Lambert Sustris.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Circle_of_Tintoretto_%28Probably_Lambert_Sustris%29%2C_Christ_at_the_Sea_of_Galilee%2C_c._1570s%2C_NGA_41637.jpg/3840px-Circle_of_Tintoretto_%28Probably_Lambert_Sustris%29%2C_Christ_at_the_Sea_of_Galilee%2C_c._1570s%2C_NGA_41637.jpg"
echo ">>> 070  Christ Crowned with Thorns"
curl -sSL -o "070_Christ Crowned with Thorns_Hieronymus Bosch.jpg" "https://upload.wikimedia.org/wikipedia/commons/5/5a/Crowned_with_Thorns_Bosch.jpg"
echo ">>> 053  Christ on the Mount of Olives"
curl -sSL -o "053_Christ on the Mount of Olives_Caravaggio.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Caravaggio_%28Michelangelo_Merisi%29_%281571_-_1610%29_-_Christ_on_the_mount_of_olives_-_359_-_Gem%C3%A4ldegalerie.jpg/3840px-Caravaggio_%28Michelangelo_Merisi%29_%281571_-_1610%29_-_Christ_on_the_mount_of_olives_-_359_-_Gem%C3%A4ldegalerie.jpg"

echo
echo "=== 校验 ==="
for n in 043 011 032 048 027 016 087 070 053; do
  f=$(ls ${n}_* 2>/dev/null | head -1)
  if [ -n "$f" ]; then
    sz=$(python3 -c "from PIL import Image; im=Image.open('$f'); print(f'{im.size[0]}x{im.size[1]}')" 2>/dev/null || echo "??")
    echo "  $n  $sz  $f"
  else echo "  $n  DOWNLOAD FAILED"; fi
done
